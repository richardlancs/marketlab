"""
The machine-learning sandbox: can a model learn to predict next week's
direction from a stock's own recent prices, and would trading on it have
paid after costs? Built to show the honest answer, which is usually no.

- Samples: for each stock and session, features known at that close
  (returns over 1, 4 and 13 weeks, RSI, the MACD histogram, the gaps to the
  50- and 200-day averages, recent volatility, volume against its average),
  and the label: did the price rise over the next 5 sessions?
- Walk-forward: train on the past `train_years` of samples, predict the next
  `test_months`, then slide forward and train again. The last 5 sessions
  before each test window are left out of training (their labels would
  overlap it), so the model is only ever scored on data it never saw.
- Trading: every 5 sessions, hold (equally weighted) each stock the model
  thinks will rise; the rest is cash. Trading costs are charged on every
  change, in basis points of the amount traded.
- Baselines: the same model trained on shuffled labels (pure luck, a few
  times, to see how much luck varies), always predicting the most common
  answer, and buying and holding the same stocks.

Small models only, with fixed seeds: the same settings on the same prices
always give the same answer.
"""

from __future__ import annotations

import math
import time
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from . import overfitting, technicals

ML_VERSION = "1.0.0"
HORIZON = 5
FEATURES = {
    "return1w": "Return over the last week",
    "return1m": "Return over the last 4 weeks",
    "return3m": "Return over the last 13 weeks",
    "rsi": "RSI (14 days)",
    "macd": "MACD histogram (relative to price)",
    "gap50": "Gap to the 50-day average",
    "gap200": "Gap to the 200-day average",
    "volatility": "Volatility (last 4 weeks)",
    "volume": "Volume against its 50-day average",
}
Model = Literal["logistic", "random-forest", "gradient-boosting"]
MODEL_NAMES = {"logistic": "Logistic regression", "random-forest": "Random forest", "gradient-boosting": "Gradient boosting"}
SHUFFLES = 3
LIMITS = {"maxSymbols": 5, "maxYears": 10, "minYears": 3, "budgetSeconds": 20}
WARMUP = 210  # sessions of history the features need (the 200-day average, and a margin)


class MLError(ValueError):
    pass


@dataclass(frozen=True)
class Settings:
    symbols: list[str]
    features: list[str]
    model: Model
    start: int
    end: int
    train_years: int = 2
    test_months: int = 3
    cost_bps: float = 10.0
    seed: int = 7


def features_of(bars: pd.DataFrame) -> pd.DataFrame:
    """Each session's features from that close and before (no look-ahead), and its label from the next 5 sessions."""
    close = bars["adj_close"]
    volume = bars["volume"] if "volume" in bars else pd.Series(np.nan, index=bars.index)
    out = pd.DataFrame(index=bars.index)
    out["return1w"] = close.pct_change(5, fill_method=None)
    out["return1m"] = close.pct_change(20, fill_method=None)
    out["return3m"] = close.pct_change(63, fill_method=None)
    out["rsi"] = technicals.rsi(close, 14) / 100
    out["macd"] = technicals.macd(close)["histogram"] / close
    out["gap50"] = close / technicals.sma(close, 50) - 1
    out["gap200"] = close / technicals.sma(close, 200) - 1
    out["volatility"] = close.pct_change(fill_method=None).rolling(20).std() * math.sqrt(252)
    out["volume"] = volume / volume.rolling(50).mean() - 1
    forward = close.shift(-HORIZON) / close - 1
    out["label"] = (forward > 0).astype(float).where(forward.notna())
    out["forward"] = forward
    return out


def _model(kind: Model, seed: int):
    if kind == "logistic":
        return make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=500))
    if kind == "random-forest":
        return RandomForestClassifier(n_estimators=60, max_depth=4, min_samples_leaf=20, random_state=seed, n_jobs=1)
    return HistGradientBoostingClassifier(max_iter=60, max_depth=3, learning_rate=0.05, l2_regularization=1.0, random_state=seed)


def _folds(dates: np.ndarray, start: int, end: int, train_years: int, test_months: int) -> list[tuple[int, int, int]]:
    """(train start, test start, test end) times: the first test window begins `train_years` after the data does."""
    first = pd.Timestamp(max(int(dates.min()), start), unit="ms")
    last = pd.Timestamp(end, unit="ms")
    cursor = first + pd.DateOffset(years=train_years)
    out = []
    while cursor < last:
        stop = min(cursor + pd.DateOffset(months=test_months), last)
        out.append((int((cursor - pd.DateOffset(years=train_years)).value // 1_000_000), int(cursor.value // 1_000_000), int(stop.value // 1_000_000)))
        cursor = stop
    return out


def _walk_forward(panel: pd.DataFrame, features: list[str], kind: Model, folds, seed: int, shuffle_seed: int | None, deadline: float) -> pd.Series:
    """Out-of-sample probabilities of a rise for every (time, symbol) in the test windows."""
    rng = np.random.default_rng(shuffle_seed) if shuffle_seed is not None else None
    sessions = np.sort(panel["time"].unique())
    predictions = []
    for train_start, test_start, test_end in folds:
        if time.monotonic() > deadline:
            raise MLError("That took too long to train. Choose fewer stocks, fewer years or a simpler model.")
        # Leave out the sessions just before the test window: their 5-session labels reach into it.
        before = sessions[sessions < test_start]
        purge_from = before[-HORIZON] if len(before) >= HORIZON else test_start
        train = panel[(panel["time"] >= train_start) & (panel["time"] < purge_from)].dropna(subset=[*features, "label"])
        test = panel[(panel["time"] >= test_start) & (panel["time"] < test_end)].dropna(subset=features)
        if len(test) == 0 or len(train) < 200 or train["label"].nunique() < 2:
            continue
        y = train["label"].to_numpy()
        if rng is not None:
            y = rng.permutation(y)
        model = _model(kind, seed).fit(train[features].to_numpy(), y)
        p = model.predict_proba(test[features].to_numpy())[:, 1]
        predictions.append(pd.Series(p, index=pd.MultiIndex.from_arrays([test["time"], test["symbol"]])))
    if not predictions:
        raise MLError("There isn't enough history for even one training window. Choose a longer period or a shorter training window.")
    return pd.concat(predictions)


def _trade(probabilities: pd.Series, returns: pd.DataFrame, cost_bps: float) -> tuple[pd.Series, float]:
    """
    Daily values of trading on the predictions: every 5 sessions, equal
    weights in the stocks predicted to rise, cash otherwise. Returns the value
    series (starting at 1) and the yearly turnover.
    """
    wide = probabilities.unstack().reindex(returns.index).reindex(columns=returns.columns)
    days = returns.index[returns.index >= wide.dropna(how="all").index.min()]
    weights = pd.Series(0.0, index=returns.columns)
    value, values, traded = 1.0, [], 0.0
    for i, t in enumerate(days):
        if i > 0:
            value *= 1 + float((weights * returns.loc[t].fillna(0.0)).sum())
        if i % HORIZON == 0:
            p = wide.loc[t]
            picks = p[p > 0.5].index
            target = pd.Series(0.0, index=returns.columns)
            if len(picks):
                target[picks] = 1 / len(picks)
            change = float((target - weights).abs().sum())
            value *= 1 - change * cost_bps / 10_000
            traded += change
            weights = target
        values.append(value)
    years = max(len(days) / 252, 1e-9)
    return pd.Series(values, index=days), traded / years


def _metrics(values: pd.Series) -> dict[str, Any]:
    daily = values.pct_change().dropna()
    years = max(len(values) / 252, 1e-9)
    total = float(values.iloc[-1] / values.iloc[0] - 1)
    sd = float(daily.std(ddof=1)) if len(daily) > 1 else 0.0
    peak = values.cummax()
    return {
        "totalReturn": total,
        "cagr": float((1 + total) ** (1 / years) - 1) if total > -1 else -1.0,
        "volatility": sd * math.sqrt(252),
        "sharpe": float(daily.mean() / sd * math.sqrt(252)) if sd > 0 else None,
        "maxDrawdown": float(((peak - values) / peak).max()),
    }


def _excess_sharpe(values: pd.Series, benchmark: pd.Series) -> float | None:
    """The annualised Sharpe ratio of the daily returns over the benchmark's (an information ratio)."""
    excess = (values.pct_change() - benchmark.reindex(values.index).pct_change()).dropna()
    sd = float(excess.std(ddof=1)) if len(excess) > 1 else 0.0
    return float(excess.mean() / sd * math.sqrt(252)) if sd > 0 else None


def _accuracy(probabilities: pd.Series, labels: pd.Series) -> dict[str, Any]:
    joined = pd.concat([probabilities.rename("p"), labels.rename("y")], axis=1, join="inner").dropna()
    n = len(joined)
    hits = float(((joined["p"] > 0.5) == (joined["y"] > 0.5)).mean()) if n else 0.0
    base = float(joined["y"].mean()) if n else 0.5
    # A 95% interval for the accuracy (normal approximation); samples overlap in time, so it's if anything too narrow.
    half = 1.96 * math.sqrt(max(hits * (1 - hits), 1e-12) / max(n, 1))
    return {"accuracy": hits, "low": max(0.0, hits - half), "high": min(1.0, hits + half), "samples": n, "upShare": base, "majority": max(base, 1 - base)}


def run(bars: Mapping[str, pd.DataFrame], settings: Settings, deadline_seconds: float = LIMITS["budgetSeconds"]) -> dict[str, Any]:
    if not 1 <= len(settings.symbols) <= LIMITS["maxSymbols"]:
        raise MLError(f"Choose 1 to {LIMITS['maxSymbols']} stocks.")
    if not settings.features or any(f not in FEATURES for f in settings.features):
        raise MLError("Choose at least one of the listed features.")
    span_years = (settings.end - settings.start) / (365.25 * 86_400_000)
    if not LIMITS["minYears"] - 0.01 <= span_years <= LIMITS["maxYears"] + 0.01:
        raise MLError(f"Choose a period of {LIMITS['minYears']} to {LIMITS['maxYears']} years.")
    if span_years < settings.train_years + 0.5:
        raise MLError("The period must be at least half a year longer than the training window.")
    missing = [s for s in settings.symbols if s not in bars]
    if missing:
        raise MLError(f"There are no stored prices for {', '.join(missing)}.")
    deadline = time.monotonic() + deadline_seconds

    frames = []
    for symbol in settings.symbols:
        f = features_of(bars[symbol])
        f = f[(f.index >= settings.start) & (f.index <= settings.end)]
        frames.append(f.assign(symbol=symbol, time=f.index))
    panel = pd.concat(frames, ignore_index=True)
    folds = _folds(panel["time"].to_numpy(), settings.start, settings.end, settings.train_years, settings.test_months)
    if not folds:
        raise MLError("The period is too short for walk-forward testing with that training window.")

    probabilities = _walk_forward(panel, settings.features, settings.model, folds, settings.seed, None, deadline)
    labels = panel.set_index(["time", "symbol"])["label"]
    closes = pd.DataFrame({s: bars[s]["adj_close"] for s in settings.symbols})
    closes = closes[(closes.index >= settings.start) & (closes.index <= settings.end)]
    returns = closes.pct_change(fill_method=None)

    strategy, turnover = _trade(probabilities, returns, settings.cost_bps)
    test_days = strategy.index
    hold = (1 + returns.loc[test_days].fillna(0.0).mean(axis=1)).cumprod()
    hold = hold / hold.iloc[0]

    luck = []
    for k in range(SHUFFLES):
        p = _walk_forward(panel, settings.features, settings.model, folds, settings.seed, settings.seed * 1000 + k, deadline)
        values, _ = _trade(p, returns, settings.cost_bps)
        luck.append({"accuracy": _accuracy(p, labels)["accuracy"], "values": values, "metrics": _metrics(values)})

    strategy_metrics = _metrics(strategy)
    sessions = len(strategy)
    # Does it beat simply holding? The Sharpe ratio of the daily returns over buy-and-hold, allowing for the luck runs as other tries.
    strategy_metrics["excessSharpe"] = _excess_sharpe(strategy, hold)
    for l in luck:
        l["metrics"]["excessSharpe"] = _excess_sharpe(l["values"], hold)
    check = overfitting.selection_check([strategy_metrics["excessSharpe"], *[l["metrics"]["excessSharpe"] for l in luck]], sessions)
    weekly = list(range(0, sessions, HORIZON)) + ([sessions - 1] if (sessions - 1) % HORIZON else [])
    median_luck = pd.concat([l["values"] for l in luck], axis=1).median(axis=1)
    return {
        "version": ML_VERSION,
        "model": settings.model,
        "features": settings.features,
        "folds": len(folds),
        "testStart": int(test_days[0]),
        "testEnd": int(test_days[-1]),
        "accuracy": _accuracy(probabilities, labels),
        "luck": {"accuracies": [l["accuracy"] for l in luck], "sharpes": [l["metrics"]["sharpe"] for l in luck], "excessSharpes": [l["metrics"]["excessSharpe"] for l in luck], "totalReturns": [l["metrics"]["totalReturn"] for l in luck]},
        "strategy": {**strategy_metrics, "turnover": turnover, "exposure": float((probabilities > 0.5).mean())},
        "buyAndHold": _metrics(hold),
        "check": check,
        "curve": {
            "times": [int(test_days[i]) for i in weekly],
            "strategy": [round(float(strategy.iloc[i]), 6) for i in weekly],
            "buyAndHold": [round(float(hold.iloc[i]), 6) for i in weekly],
            "luck": [round(float(median_luck.iloc[i]), 6) for i in weekly],
        },
        "importance": _importance(panel, settings, folds[-1]),
    }


def _importance(panel: pd.DataFrame, settings: Settings, fold: tuple[int, int, int]) -> dict[str, float]:
    """How much each feature mattered to the last trained model: |coefficient| for logistic regression, the trees' own importances otherwise, scaled to sum to 1."""
    train = panel[(panel["time"] >= fold[0]) & (panel["time"] < fold[1])].dropna(subset=[*settings.features, "label"])
    if len(train) < 200 or train["label"].nunique() < 2:
        return {}
    model = _model(settings.model, settings.seed)
    model.fit(train[settings.features].to_numpy(), train["label"].to_numpy())
    if settings.model == "logistic":
        raw = np.abs(model[-1].coef_[0])
    elif settings.model == "random-forest":
        raw = model.feature_importances_
    else:
        # Histogram gradient boosting has no built-in importances: use how often each feature is split on.
        counts = np.zeros(len(settings.features))
        for predictors in model._predictors:
            for tree in predictors:
                for node in tree.nodes:
                    if not node["is_leaf"]:
                        counts[node["feature_idx"]] += 1
        raw = counts
    total = float(np.sum(raw)) or 1.0
    return {f: round(float(v) / total, 4) for f, v in zip(settings.features, raw)}


# --- Snapshots, saving and reproducing -------------------------------------------------

DAY_MS = 86_400_000


def snapshot(db, source: str, settings: Settings) -> dict[str, Any]:
    """
    Exactly the prices a run uses (adjusted closes and volumes, from enough
    sessions before the start for the features to warm up), so a saved run
    can be reproduced from what it saw even after the stored prices change.
    """
    import hashlib
    import json

    from . import store

    index = store.series_index(db, source, settings.symbols)
    missing = [s for s in settings.symbols if s not in index]
    if missing:
        raise MLError(f"There are no stored prices for {', '.join(missing)}.")
    since = settings.start - int(WARMUP * 1.6 + 30) * DAY_MS
    bars = store.load_bars(db, source, settings.symbols, since)
    series = {
        s: {"times": [int(t) for t in bars[s].index if t <= settings.end], "close": [round(float(v), 6) for t, v in bars[s]["adj_close"].items() if t <= settings.end], "volume": [None if np.isnan(v) else float(v) for t, v in bars[s]["volume"].items() if t <= settings.end]}
        for s in settings.symbols
    }
    checksum = hashlib.sha256(json.dumps(series, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    as_of = max(index[s].last_time for s in settings.symbols)
    return {"version": 1, "source": source, "simulated": source == "mock", "asOf": int(as_of), "checksum": checksum, "datasetVersion": f"{source}:{checksum[:12]}", "series": series}


def bars_of(snap: Mapping[str, Any]) -> dict[str, pd.DataFrame]:
    """A snapshot's prices in the shape run() takes."""
    return {
        s: pd.DataFrame({"adj_close": np.asarray(v["close"], dtype=float), "volume": np.asarray([np.nan if x is None else x for x in v["volume"]], dtype=float)}, index=pd.Index(v["times"], dtype=np.int64))
        for s, v in snap["series"].items()
    }


def provenance(snap: Mapping[str, Any]) -> dict[str, Any]:
    import sklearn

    return {
        "dataset": {k: snap[k] for k in ("source", "simulated", "asOf", "checksum", "datasetVersion")},
        "method": {"version": ML_VERSION, "scikitLearn": sklearn.__version__},
    }


def summary_of(result: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "model": result["model"],
        "accuracy": result["accuracy"]["accuracy"],
        "majority": result["accuracy"]["majority"],
        "totalReturn": result["strategy"]["totalReturn"],
        "buyAndHoldReturn": result["buyAndHold"]["totalReturn"],
    }


def compare(stored: Mapping[str, Any], reproduced: Mapping[str, Any]) -> dict[str, Any]:
    """Whether a reproduced run matches the saved one: every curve point and headline number, within 1e-9."""
    differences: list[str] = []
    largest = 0.0

    def check(label: str, a: Any, b: Any) -> None:
        nonlocal largest
        if a is None or b is None:
            if a is not b:
                differences.append(f"{label}: {a} then, {b} now")
            return
        gap = abs(float(a) - float(b))
        largest = max(largest, gap)
        if gap > 1e-9 * max(1.0, abs(float(a))):
            differences.append(f"{label}: {a:.6g} then, {b:.6g} now")

    check("accuracy", stored["accuracy"]["accuracy"], reproduced["accuracy"]["accuracy"])
    for key in ("totalReturn", "sharpe", "maxDrawdown", "turnover"):
        check(f"strategy {key}", stored["strategy"][key], reproduced["strategy"][key])
    for i, (a, b) in enumerate(zip(stored["curve"]["strategy"], reproduced["curve"]["strategy"])):
        check(f"value in week {i + 1}", a, b)
    if len(stored["curve"]["strategy"]) != len(reproduced["curve"]["strategy"]):
        differences.append("The number of weeks differs.")
    return {"matches": not differences, "largestDifference": largest, "differences": differences[:5]}
