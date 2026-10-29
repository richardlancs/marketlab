"""
The analytics service's HTTP API (FastAPI). It only translates between JSON
and the engine (analytics/engine.py), which does all the calculating.

Only MarketLab's Next.js server calls it: requests carry the shared secret
ANALYTICS_SERVICE_TOKEN as a bearer token, and the prices come from the
Next.js server's own market data, never from a browser.

    GET  /health                             Liveness, and the engine version. No token needed.
    POST /v1/backtests                       Runs one backtest. See BacktestRequest / BacktestResponse.
    POST /v1/backtests/luck                  A run against 1,000 random versions of itself, and its Sharpe ratio's range.
    POST /v1/saved-runs                      Calculates a run from a snapshot and saves it (database).
    POST /v1/saved-runs/{id}/reproduce       Reads a saved run (database), recalculates it, compares.
    POST /v1/analytics/stock-profiles        Recalculates stored stock profiles that are missing or stale (database).
    POST /v1/analytics/portfolio             Risk, stress tests, Monte Carlo and optimisation for a set of holdings (stored prices).
    POST /v1/analytics/correlation           How a set of stocks move together: correlations, clusters, effective bets (stored prices).
    POST /v1/backtests/walk-forward          Walk-forward test of a moving-average crossover (stored prices).
    POST /v1/screens/history                 A stock screen applied every month over the past (stored prices).
    POST /v1/saved-screens                   Calculates a historical screen and saves it with its input prices (database).
    POST /v1/saved-screens/{id}/reproduce    Recalculates a saved historical screen from its saved prices, compares.
    POST /v1/pairs/scan                      Same-sector pairs tested for cointegration over a formation year (stored prices).
    POST /v1/pairs/backtest                  One pair's gap traded over the year after its formation (stored prices).
"""

from __future__ import annotations

import hmac
import json
import math
import os

import numpy as np
import pandas as pd
from collections.abc import Sequence
from typing import Annotated, Literal, Union

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

from . import db as database
from . import analysis, correlation, engine, factors, fundamentals, jobs, luck, ml, option_marks, options, overfitting, pairs, performance, plan, portfolio, review, saved, screener, screens, snapshots, store, walkforward

#: The largest request body accepted: 6 series of MAX_POINTS points with room to spare.
MAX_BODY_BYTES = 2_000_000


class Model(BaseModel):
    """camelCase JSON, like MarketLab's TypeScript types; unknown fields are refused."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


# --- Request ---------------------------------------------------------------


class Holding(Model):
    symbol: Annotated[str, Field(pattern=r"^[A-Z0-9][A-Z0-9.\-]{0,9}$")]
    weight: Annotated[float, Field(gt=0, le=1, allow_inf_nan=False)]


class BuyAndHold(Model):
    kind: Literal["buy-and-hold"]


class MovingAverage(Model):
    kind: Literal["moving-average"]
    fast: Annotated[int, Field(ge=2, le=249)]
    slow: Annotated[int, Field(ge=3, le=250)]

    @model_validator(mode="after")
    def fast_below_slow(self):
        if self.fast >= self.slow:
            raise ValueError("the short average must be shorter than the long one")
        return self


class DollarCostAveraging(Model):
    kind: Literal["dollar-cost-averaging"]
    installments: Annotated[int, Field(ge=1, le=60)]


class Rebalancing(Model):
    kind: Literal["rebalancing"]
    frequency: Literal["monthly", "quarterly"]


# Custom rules (lib/backtest/rules.ts): plain data, checked here exactly as parseRuleSet does.
class PriceIndicator(Model):
    kind: Literal["price"]


class AverageIndicator(Model):
    kind: Literal["sma", "ema"]
    days: Annotated[int, Field(ge=2, le=250)]


class RsiIndicator(Model):
    kind: Literal["rsi"]
    days: Annotated[int, Field(ge=2, le=100)]


class MacdIndicator(Model):
    kind: Literal["macd", "macd-signal"]


class BollingerIndicator(Model):
    kind: Literal["bollinger-upper", "bollinger-lower"]
    days: Annotated[int, Field(ge=2, le=250)]


class ChandelierIndicator(Model):
    kind: Literal["chandelier"]
    days: Annotated[int, Field(ge=2, le=100)]
    multiple: Annotated[float, Field(ge=0.5, le=10, allow_inf_nan=False)]


class VolumeIndicator(Model):
    kind: Literal["volume"]


class VolumeAverageIndicator(Model):
    kind: Literal["volume-average"]
    days: Annotated[int, Field(ge=2, le=250)]


class ValueIndicator(Model):
    kind: Literal["value"]
    value: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]


Indicator = Annotated[
    Union[PriceIndicator, AverageIndicator, RsiIndicator, MacdIndicator, BollingerIndicator, ChandelierIndicator, VolumeIndicator, VolumeAverageIndicator, ValueIndicator],
    Field(discriminator="kind"),
]


def _unit(indicator) -> str:
    if indicator.kind in ("rsi", "value"):
        return "score"
    if indicator.kind in ("volume", "volume-average"):
        return "shares"
    return "macd" if indicator.kind in ("macd", "macd-signal") else "dollars"


class Condition(Model):
    left: Indicator
    op: Literal["above", "below", "crosses-above", "crosses-below"]
    right: Indicator

    @model_validator(mode="after")
    def comparable(self):
        if self.left.kind == "value":
            raise ValueError("a constant can only be on the right")
        if _unit(self.left) != _unit(self.right):
            raise ValueError("both sides of a condition must be prices or both scores")
        return self


class RuleSet(Model):
    combine: Literal["all", "any"]
    conditions: Annotated[list[Condition], Field(min_length=1, max_length=4)]


class RulesStrategy(Model):
    kind: Literal["rules"]
    entry: RuleSet
    exit: RuleSet


class MomentumRotationModel(Model):
    kind: Literal["momentum-rotation"]
    top: Annotated[int, Field(ge=1, le=5)]
    lookback_months: Literal[3, 6, 12]
    absolute: bool


class RiskParityModel(Model):
    kind: Literal["risk-parity"]
    frequency: Literal["monthly", "quarterly"]


class OptimisedModel(Model):
    kind: Literal["optimised"]
    objective: Literal["min-variance", "max-sharpe"]
    frequency: Literal["monthly", "quarterly"]
    lookback_months: Literal[12, 36]


class CostsModel(Model):
    commission: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]
    slippage_bps: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]


class ConfigModel(Model):
    """MarketLab's BacktestConfig (lib/backtest/config.ts), for the strategies this service runs."""

    version: Annotated[int, Field(ge=1, le=2)]
    holdings: Annotated[list[Holding], Field(min_length=1, max_length=5)]
    strategy: Annotated[Union[BuyAndHold, MovingAverage, DollarCostAveraging, Rebalancing, RulesStrategy, MomentumRotationModel, RiskParityModel, OptimisedModel], Field(discriminator="kind")]
    start: int
    end: int
    initial_cash: Annotated[float, Field(ge=100, le=10_000_000, allow_inf_nan=False)]
    costs: CostsModel
    benchmark: Literal["same-stocks", "market"]

    @model_validator(mode="after")
    def check(self):
        if self.start >= self.end:
            raise ValueError("the start must be before the end")
        symbols = [h.symbol for h in self.holdings]
        if len(set(symbols)) != len(symbols):
            raise ValueError("each stock may appear once")
        if abs(sum(h.weight for h in self.holdings) - 1) > 0.001:
            raise ValueError("the weights must add up to 100%")
        if self.strategy.kind == "momentum-rotation" and self.strategy.top > len(self.holdings):
            raise ValueError("momentum rotation can't hold more stocks than are listed")
        if self.strategy.kind == "optimised" and len(self.holdings) < 2:
            raise ValueError("optimising needs at least two stocks")
        return self


class SeriesModel(Model):
    """Daily closes: parallel lists of timestamps (ms) and prices, oldest first."""

    times: Annotated[list[int], Field(min_length=1, max_length=engine.MAX_POINTS)]
    # Non-finite numbers are refused here; ordering, duplicates and positivity by engine.to_series.
    prices: Annotated[list[float], Field(min_length=1, max_length=engine.MAX_POINTS)]

    # Only when a rule needs them (lib/backtest/snapshot.ts): adjusted highs and lows, and volumes.
    high: list[float] | None = None
    low: list[float] | None = None
    volume: list[float | None] | None = None

    @field_validator("prices")
    @classmethod
    def finite(cls, prices: list[float]) -> list[float]:
        if not all(math.isfinite(p) for p in prices):
            raise ValueError("every price must be a finite number")
        return prices

    @model_validator(mode="after")
    def extras_line_up(self):
        for name in ("high", "low", "volume"):
            values = getattr(self, name)
            if values is not None and len(values) != len(self.times):
                raise ValueError(f"{name} must have one value per date")
        return self


class SnapshotMarket(Model):
    symbol: str
    name: str
    data: SeriesModel


class SnapshotModel(Model):
    """A price snapshot (lib/backtest/snapshot.ts): the exact prices a run used."""

    version: Literal[1]
    source: Literal["mock", "tiingo"]
    simulated: bool
    as_of: int
    adjustment: Literal["split-and-dividend-adjusted-closes"]
    series: Annotated[dict[str, SeriesModel], Field(min_length=1, max_length=5)]
    market: SnapshotMarket | None


class DatasetModel(Model):
    checksum: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    dataset_version: Annotated[str, Field(max_length=40)]
    source: Literal["mock", "tiingo"]
    simulated: bool
    as_of: int
    first_date: int | None
    last_date: int | None
    observations: int


OwnerId = Annotated[str, Field(min_length=1, max_length=64)]


class SavedRunInfo(Model):
    id: Annotated[str, Field(min_length=1, max_length=64)]
    name: Annotated[str, Field(min_length=1, max_length=80)]
    created_at: int


class SaveRequest(Model):
    """Save a run: the service calculates it from the snapshot itself, then stores the result and the snapshot."""

    owner_id: OwnerId
    run: SavedRunInfo
    config: "ConfigModel"
    snapshot: SnapshotModel
    dataset: DatasetModel
    note: Annotated[str, Field(max_length=2000)] | None = None
    assumptions: dict[str, Annotated[str, Field(max_length=500)]]


class OwnerRequest(Model):
    owner_id: OwnerId


class BacktestRequest(Model):
    config: ConfigModel
    prices: Annotated[dict[str, SeriesModel], Field(min_length=1, max_length=5)]
    """Each holding's adjusted daily closes."""
    market: SeriesModel | None = None
    """The market index, needed when the benchmark is "market"."""
    warmup: Literal["within-period", "pre-start"] = "within-period"
    """Where a moving average's warm-up sessions come from (see engine.py). "pre-start" uses sessions before the start date, if the prices include them."""
    include_ledger: bool = False
    """Also return each session's cash, shares and value, and the decisions made."""


# --- Response --------------------------------------------------------------


class Point(Model):
    time: int
    price: float


class TradeModel(Model):
    time: int
    symbol: str
    side: Literal["buy", "sell"]
    shares: float
    price: float
    commission: float


class MetricsModel(Model):
    final_value: float
    total_return: float
    cagr: float
    max_drawdown: float
    drawdown_peak: int | None
    drawdown_trough: int | None
    volatility: float
    sharpe: float | None
    trades: int
    exposure: float


class LedgerRow(Model):
    time: int
    cash: float
    shares: dict[str, float]
    holdings_value: float
    total_value: float
    decided: bool


class DecisionModel(Model):
    time: int
    target: dict[str, float]
    based_on: int | None


class RunModel(Model):
    equity: list[Point]
    trades: list[TradeModel]
    metrics: MetricsModel
    ledger: list[LedgerRow] | None = None
    decisions: list[DecisionModel] | None = None


class EngineInfo(Model):
    name: str
    version: str


class BacktestResponse(Model):
    engine: EngineInfo
    run: RunModel
    benchmark: RunModel
    warnings: list[str]
    assumptions: dict[str, str]
    warmup: Literal["within-period", "pre-start"]
    extras: dict | None = None
    """More measures and period returns for the results page (analysis.py)."""


def _run_model(run: engine.Run, include_ledger: bool = False) -> RunModel:
    return RunModel(
        equity=[Point(time=t, price=v) for t, v in run.equity],
        trades=[TradeModel(**t.__dict__) for t in run.trades],
        metrics=MetricsModel(**run.metrics.__dict__),
        ledger=[LedgerRow(**{**r.__dict__, "shares": dict(r.shares)}) for r in run.ledger] if include_ledger else None,
        decisions=[DecisionModel(time=d.time, target=dict(d.target), based_on=d.based_on) for d in run.decisions] if include_ledger else None,
    )


# --- App -------------------------------------------------------------------

app = FastAPI(title="MarketLab analytics", version=engine.ENGINE_VERSION, docs_url=None, redoc_url=None, openapi_url=None)


def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
    """Only callers holding ANALYTICS_SERVICE_TOKEN; with no token configured, nobody."""
    expected = os.environ.get("ANALYTICS_SERVICE_TOKEN", "")
    if not expected:
        raise HTTPException(status_code=503, detail="The analytics service has no ANALYTICS_SERVICE_TOKEN set, so it accepts no requests.")
    given = authorization.removeprefix("Bearer ").strip() if authorization and authorization.startswith("Bearer ") else ""
    if not hmac.compare_digest(given.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Missing or wrong service token.")


@app.middleware("http")
async def limit_body(request: Request, call_next):
    length = request.headers.get("content-length")
    if length is not None and (not length.isdigit() or int(length) > MAX_BODY_BYTES):
        return JSONResponse(status_code=413, content={"error": f"Requests are limited to {MAX_BODY_BYTES} bytes."})
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def invalid_request(_request: Request, exc: RequestValidationError):
    # A short, readable list of what was wrong, for the Next.js server's logs and error message.
    problems = [f"{'.'.join(str(p) for p in e['loc'][1:])}: {e['msg']}" for e in exc.errors()[:5]]
    return JSONResponse(status_code=422, content={"error": "Invalid backtest request.", "problems": problems})


@app.exception_handler(HTTPException)
async def http_error(_request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "engine": {"name": engine.ENGINE_NAME, "version": engine.ENGINE_VERSION}}


def to_engine_config(c: ConfigModel, warmup: str = "within-period") -> engine.Config:
    return engine.Config(
        holdings=[(h.symbol, h.weight) for h in c.holdings],
        strategy=c.strategy.kind,
        start=c.start,
        end=c.end,
        initial_cash=c.initial_cash,
        costs=engine.Costs(commission=c.costs.commission, slippage_bps=c.costs.slippage_bps),
        benchmark=c.benchmark,
        fast=getattr(c.strategy, "fast", None),
        slow=getattr(c.strategy, "slow", None),
        warmup=warmup,
        installments=getattr(c.strategy, "installments", None),
        frequency=getattr(c.strategy, "frequency", None),
        top=getattr(c.strategy, "top", None),
        lookback_months=getattr(c.strategy, "lookback_months", None),
        absolute=getattr(c.strategy, "absolute", None),
        objective=getattr(c.strategy, "objective", None),
        entry=c.strategy.entry.model_dump() if c.strategy.kind == "rules" else None,
        exit=c.strategy.exit.model_dump() if c.strategy.kind == "rules" else None,
    )


def get_database() -> database.Database:
    """MarketLab's database (overridden in tests)."""
    return database.from_environment()


@app.exception_handler(database.DatabaseError)
async def database_error(_request: Request, exc: database.DatabaseError):
    print(f"[analytics] database error: {exc}")
    return JSONResponse(status_code=503, content={"error": "The database couldn't be reached. Try again in a minute."})


@app.post("/v1/backtests", response_model=BacktestResponse, response_model_by_alias=True, dependencies=[Depends(require_token)])
def run_backtest(body: BacktestRequest) -> BacktestResponse:
    try:
        prices = {symbol: engine.to_series(symbol, s.times, s.prices) for symbol, s in body.prices.items()}
        market = engine.to_series("Market", body.market.times, body.market.prices) if body.market else None
        extras = saved.extras_of({symbol: s.model_dump() for symbol, s in body.prices.items()})
        outcome = engine.run_config(to_engine_config(body.config, body.warmup), prices, market, extras)
    except engine.InputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    run, benchmark = _run_model(outcome.run, body.include_ledger), _run_model(outcome.benchmark, body.include_ledger)
    return BacktestResponse(
        engine=EngineInfo(name=engine.ENGINE_NAME, version=engine.ENGINE_VERSION),
        run=run,
        benchmark=benchmark,
        warnings=outcome.warnings,
        assumptions=engine.ASSUMPTIONS,
        warmup=body.warmup,
        extras=analysis.extras(
            run.model_dump(by_alias=True),
            benchmark.model_dump(by_alias=True),
            body.config.costs.model_dump(by_alias=True),
            _run_model(outcome.alternative).model_dump(by_alias=True) if outcome.alternative else None,
        ),
    )


class AnalyseRequest(Model):
    """A finished result (run and benchmark, as JSON) and its costs: for results saved before their measures were."""

    run: dict
    benchmark: dict
    costs: CostsModel


@app.post("/v1/backtests/analyse", dependencies=[Depends(require_token)])
def analyse(body: AnalyseRequest) -> dict:
    """More measures and period returns for a finished result (analysis.py)."""
    try:
        return {"extras": analysis.extras(body.run, body.benchmark, body.costs.model_dump(by_alias=True))}
    except (KeyError, TypeError, ZeroDivisionError, IndexError) as error:
        raise HTTPException(status_code=422, detail=f"That result couldn't be read: {error}") from error


class LuckRequest(Model):
    """A backtest to check against random versions of itself (luck.py): its settings and prices, as for /v1/backtests."""

    config: ConfigModel
    prices: Annotated[dict[str, SeriesModel], Field(min_length=1, max_length=5)]
    market: SeriesModel | None = None


@app.post("/v1/backtests/luck", dependencies=[Depends(require_token)])
def run_luck(body: LuckRequest) -> dict:
    """How the run compares with 1,000 random versions of itself, and a range for its Sharpe ratio (luck.py)."""
    try:
        prices = {symbol: engine.to_series(symbol, s.times, s.prices) for symbol, s in body.prices.items()}
        market = engine.to_series("Market", body.market.times, body.market.prices) if body.market else None
        extras = saved.extras_of({symbol: s.model_dump() for symbol, s in body.prices.items()})
        result = luck.luck(to_engine_config(body.config), prices, market, extras)
    except engine.InputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"engine": {"name": engine.ENGINE_NAME, "version": engine.ENGINE_VERSION}, "result": result}


class SweepRequest(Model):
    """A parameter sweep: the base settings, and the same settings with each grid point's values (null where they aren't valid)."""

    base: ConfigModel
    points: Annotated[list[ConfigModel | None], Field(min_length=1, max_length=200)]
    prices: Annotated[dict[str, SeriesModel], Field(min_length=1, max_length=5)]
    market: SeriesModel | None = None


@app.post("/v1/backtests/sweep", dependencies=[Depends(require_token)])
def run_sweep(body: SweepRequest) -> dict:
    """
    Runs every point of a sweep on the same prices, keeping each one's
    metrics (not its daily values), plus the benchmark (the same for every
    point) and how much to trust the best result (overfitting.py).
    """
    try:
        prices = {symbol: engine.to_series(symbol, s.times, s.prices) for symbol, s in body.prices.items()}
        market = engine.to_series("Market", body.market.times, body.market.prices) if body.market else None
        extras = saved.extras_of({symbol: s.model_dump() for symbol, s in body.prices.items()})
        base = engine.run_config(to_engine_config(body.base), prices, market, extras)
    except engine.InputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    metrics: list[dict | None] = []
    for point in body.points:
        if point is None:
            metrics.append(None)
            continue
        try:
            run = engine.run_config(to_engine_config(point), prices, market, extras).run
            metrics.append(MetricsModel(**run.metrics.__dict__).model_dump(by_alias=True))
        except engine.InputError:
            metrics.append(None)  # e.g. averages longer than the date range
    return {
        "engine": {"name": engine.ENGINE_NAME, "version": engine.ENGINE_VERSION},
        "metrics": metrics,
        "benchmark": MetricsModel(**base.benchmark.metrics.__dict__).model_dump(by_alias=True),
        "check": overfitting.selection_check([m["sharpe"] if m else None for m in metrics], len(base.run.equity)),
    }


@app.post("/v1/saved-runs", dependencies=[Depends(require_token)])
def save_run(body: SaveRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """
    Calculates a run from its snapshot and saves it, with the snapshot, for
    `ownerId` (the Next.js server has already checked who that is). The
    result stored is this service's own calculation, not one sent to it.
    """
    snapshot = body.snapshot.model_dump(by_alias=True)
    # Stored exactly as MarketLab made it: a series without highs, lows and volumes has no such keys at all
    # (not nulls), so the stored snapshot reads back and checks out the same in TypeScript.
    for series in [*snapshot["series"].values(), *([snapshot["market"]["data"]] if snapshot.get("market") else [])]:
        for key in ("high", "low", "volume"):
            if series.get(key) is None:
                series.pop(key, None)
    try:
        outcome = saved.outcome_from_snapshot(to_engine_config(body.config), snapshot)
    except engine.InputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    dataset = body.dataset.model_dump(by_alias=True)
    result = saved.stored_result(outcome, note=body.note, dataset=dataset, assumptions=body.assumptions, costs=body.config.costs.model_dump(by_alias=True))
    summary = saved.summary_of(outcome)
    ok = database.save_run(
        db,
        body.owner_id,
        run_id=body.run.id,
        name=body.run.name,
        created_at=body.run.created_at,
        config_json=json.dumps(body.config.model_dump(by_alias=True)),
        summary_json=json.dumps(summary),
        result_json=json.dumps(result),
        snapshot_json=json.dumps(snapshot),
        checksum=body.dataset.checksum,
        source=body.snapshot.source,
        simulated=body.snapshot.simulated,
        as_of=body.snapshot.as_of,
        engine=engine.ENGINE_NAME,
        engine_version=engine.ENGINE_VERSION,
        dataset_version=body.dataset.dataset_version,
    )
    if not ok:
        if not db.query("SELECT 1 FROM user WHERE id = ?", [body.owner_id]):
            raise HTTPException(status_code=404, detail="That account doesn't exist.")
        raise HTTPException(status_code=409, detail=f"You can save up to {database.MAX_SAVED_RUNS} runs. Delete one to make room.")
    return {"summary": summary, "result": result}


@app.post("/v1/saved-runs/{run_id}/reproduce", dependencies=[Depends(require_token)])
def reproduce_run(run_id: Annotated[str, Path(min_length=1, max_length=64)], body: OwnerRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """Reads one of the owner's saved runs from the database, calculates it again from its saved prices, and compares."""
    try:
        return saved.reproduce(db, body.owner_id, run_id, lambda config: to_engine_config(ConfigModel.model_validate(config)))
    except saved.NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except saved.NotReproducible as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except engine.InputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


# --- Stored analytics ----------------------------------------------------------

Source = Literal["mock", "tiingo"]
Symbol = Annotated[str, Field(pattern=r"^[A-Z0-9][A-Z0-9.\-]{0,9}$")]


class JobRequest(Model):
    source: Source
    symbols: Annotated[list[Symbol], Field(max_length=200)] | None = None
    """Only these (default: every stored series)."""
    budget_ms: Annotated[int, Field(ge=500, le=25_000)] = 8000


@app.post("/v1/analytics/stock-profiles", dependencies=[Depends(require_token)])
def stock_profiles(body: JobRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """Recalculates the stock profiles that are missing or stale, as far as the time budget allows; `remaining` lists the rest."""
    summary = jobs.run_stock_profiles(db, body.source, body.symbols, body.budget_ms)
    return {
        "computed": len(summary.computed),
        "unchanged": summary.unchanged,
        "missing": summary.missing,
        "failed": summary.failed,
        "remaining": summary.remaining,
        "ms": summary.ms,
    }


class PortfolioHolding(Model):
    symbol: Symbol
    value: Annotated[float, Field(ge=-1e12, le=1e12, allow_inf_nan=False)]
    """Negative for a short."""
    sector: Annotated[str, Field(max_length=60)] | None = None


class PortfolioRequest(Model):
    source: Source
    holdings: Annotated[list[PortfolioHolding], Field(min_length=1, max_length=30)]
    cash: Annotated[float, Field(ge=0, le=1e12, allow_inf_nan=False)] = 0.0


@app.post("/v1/analytics/portfolio", dependencies=[Depends(require_token)])
def portfolio_analysis(body: PortfolioRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """Analyses these holdings with the stored prices (the Next.js server stores them first). Nothing is saved."""
    symbols = list(dict.fromkeys(h.symbol for h in body.holdings))
    bars = store.load_bars(db, body.source, [*symbols, store.MARKET])
    index = store.series_index(db, body.source, [*symbols, store.MARKET])
    checksum = store.input_checksum(index)
    values: dict[str, float] = {}
    for h in body.holdings:
        values[h.symbol] = values.get(h.symbol, 0.0) + h.value
    try:
        result = portfolio.portfolio_analysis(
            {s: b for s, b in bars.items() if s in values},
            values,
            body.cash,
            {h.symbol: h.sector for h in body.holdings},
            bars.get(store.MARKET),
            seed_text=f"{checksum}:{sorted(values.items())}:{body.cash}",
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"analysis": result, "inputChecksum": checksum, "version": store.ANALYTICS_VERSION}


class AxisModel(Model):
    from_: Annotated[int, Field(alias="from", ge=2, le=250)]
    to: Annotated[int, Field(ge=2, le=250)]
    step: Annotated[int, Field(ge=1, le=250)]

    def values(self) -> list[int]:
        return list(range(self.from_, self.to + 1, self.step))


class WalkForwardRequest(Model):
    source: Source
    config: ConfigModel
    fast: AxisModel
    slow: AxisModel
    train_years: Annotated[int, Field(ge=1, le=3)] = 2
    test_months: Literal[3, 6, 12] = 6


class ContractIn(Model):
    kind: Literal["call", "put"]
    strike: Annotated[float, Field(gt=0, allow_inf_nan=False)]
    expiry: int


class TradeIn(Model):
    id: Annotated[str, Field(max_length=200)] | None = None
    time: int
    symbol: Symbol
    side: Literal["buy", "sell"]
    shares: Annotated[float, Field(gt=0, allow_inf_nan=False)]
    """Shares, or for an option, contracts (100 shares each)."""
    price: Annotated[float, Field(ge=0, allow_inf_nan=False)]
    """Zero only for an option that expired worthless."""
    realized_gain: Annotated[float, Field(allow_inf_nan=False)] | None = None
    """Trades that close a position: the gain against the average cost, as the account recorded it (the review recovers starting costs from it)."""
    reason: Literal["value", "momentum", "news", "dip", "rebalance", "other"] | None = None
    option: ContractIn | None = None


class EventIn(Model):
    time: int
    kind: Literal["dividend", "split", "borrow-fee", "margin-call", "expiry"]
    symbol: Symbol
    shares: Annotated[float, Field(allow_inf_nan=False)]
    """Negative for a short."""
    cash: Annotated[float, Field(allow_inf_nan=False)]
    shares_after: Annotated[float, Field(allow_inf_nan=False)] | None = None


class HoldingIn(Model):
    symbol: Symbol
    shares: Annotated[float, Field(allow_inf_nan=False)]
    """Negative for a short."""
    average_cost: Annotated[float, Field(ge=0, allow_inf_nan=False)] | None = None


class OptionIn(ContractIn):
    symbol: Symbol
    contracts: Annotated[float, Field(allow_inf_nan=False)]
    """Negative for written options."""
    average_premium: Annotated[float, Field(ge=0, allow_inf_nan=False)] | None = None
    mark: Annotated[float, Field(ge=0, allow_inf_nan=False)] | None = None


class AccountIn(Model):
    """The parts of a simulated account (lib/trading.ts) its history needs."""

    cash: Annotated[float, Field(allow_inf_nan=False)]
    holdings: Annotated[list[HoldingIn], Field(max_length=200)]
    trades: Annotated[list[TradeIn], Field(max_length=1000)]
    events: Annotated[list[EventIn], Field(max_length=2000)] = []
    options: Annotated[list[OptionIn], Field(max_length=50)] = []


class ClosesIn(Model):
    times: Annotated[list[int], Field(min_length=1, max_length=engine.MAX_POINTS)]
    prices: Annotated[list[float], Field(min_length=1, max_length=engine.MAX_POINTS)]


class PerformanceRequest(Model):
    account: AccountIn
    history: Annotated[dict[Symbol, ClosesIn], Field(max_length=200)]
    """Each relevant stock's closes as traded (not adjusted)."""
    index: ClosesIn
    """The index's days in the chosen range: the days the portfolio is valued on."""
    owner_id: OwnerId | None = None
    """The account's id, verified by the Next.js server: its nightly snapshots are used for past closes."""


@app.post("/v1/portfolio/performance", dependencies=[Depends(require_token)])
def portfolio_performance(body: PerformanceRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """A portfolio's value on each of the index's days, next to the index, with both sides' measures (performance.py)."""
    account = body.account.model_dump()
    history = {s: list(zip(c.times, c.prices)) for s, c in body.history.items()}
    stored = snapshots.stored_values(db, body.owner_id, body.index.times[0], body.index.times[-1]) if body.owner_id else None
    return performance.performance(account, history, list(zip(body.index.times, body.index.prices)), stored)


class ReviewRequest(Model):
    source: Source
    account: AccountIn
    history: Annotated[dict[Symbol, ClosesIn], Field(max_length=200)]
    """Each relevant stock's closes as traded (not adjusted)."""
    index: ClosesIn
    """The S&P 500's closes, at least from the oldest trade on: the sessions everything is counted in."""
    stops: Annotated[list[Annotated[str, Field(max_length=200)]], Field(max_length=100)] = []
    """The ids of sales a stop-loss or trailing stop filled."""


def _review_inputs(body: ReviewRequest, db: database.Database, extra: Sequence[str] = ()) -> tuple[dict, dict, dict, list[tuple[int, float]], pd.Series | None]:
    account = body.account.model_dump(by_alias=True)
    history = {s: list(zip(c.times, c.prices)) for s, c in body.history.items()}
    index = list(zip(body.index.times, body.index.prices))
    first = min((t["time"] for t in account["trades"]), default=body.index.times[-1])
    symbols = list(dict.fromkeys([*performance.relevant_symbols(account), *extra, store.MARKET]))
    adjusted = store.load_closes(db, body.source, symbols, first - 30 * 86_400_000, body.index.times[-1] + 86_400_000)
    return account, history, adjusted, index, adjusted.get(store.MARKET)


@app.post("/v1/portfolio/review", dependencies=[Depends(require_token)])
def portfolio_review(body: ReviewRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """The account's own trading reviewed: FIFO round trips, after-sale returns, the disposition effect, and doing nothing instead (review.py)."""
    account, history, adjusted, index, market = _review_inputs(body, db)
    return {"review": review.review(account, history, adjusted, index, market, body.stops)}


class AccountLuckRequest(ReviewRequest):
    universe: Annotated[list[Symbol], Field(min_length=2, max_length=200)]
    """The catalog's stocks: what a random picker chooses from."""


@app.post("/v1/portfolio/luck", dependencies=[Depends(require_token)])
def portfolio_luck(body: AccountLuckRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """The account's trading against 1,000 random traders with its habits, and a range for its Sharpe ratio (luck.account_luck)."""
    account, history, adjusted, index, _ = _review_inputs(body, db, body.universe)
    if not account["trades"]:
        return {"result": {"timing": None, "picking": None, "sharpeRange": None, "notes": ["There are no trades to compare yet."], "trips": 0}}
    times_all = [t for t, _ in index]
    first = review.session_of(times_all, min(t["time"] for t in account["trades"]))
    times = times_all[first:]
    trips = review.round_trips(account, history, times[-1])
    trips_with_exit = [*trips["closed"], *({**t, "exit": None} for t in trips["open"])]
    try:
        values = np.array(performance.value_series(account, history, times), dtype=float)
    except performance.MissingPrices:
        values = None
    index_values = np.array([v for _, v in index[first:]], dtype=float)
    seed = json.dumps({"trades": [[t["time"], t["symbol"], t["shares"]] for t in account["trades"]], "last": times[-1]})
    universe = [s for s in body.universe if s in adjusted]
    return {"result": luck.account_luck(trips_with_exit, adjusted, universe, times, values, index_values, seed)}


class CompanyFactsRequest(Model):
    ciks: Annotated[list[Annotated[int, Field(ge=1, le=9_999_999_999)]], Field(min_length=1, max_length=3)]
    """The company's SEC numbers to try in turn (a predecessor's after the current one)."""
    user_agent: Annotated[str, Field(min_length=1, max_length=200)]
    """Who's asking, as the SEC requires (SEC_USER_AGENT on the Next.js server)."""


@app.post("/v1/fundamentals/company", dependencies=[Depends(require_token)])
def company_facts(body: CompanyFactsRequest) -> dict:
    """A company's reported numbers from the SEC, parsed (fundamentals.py): the first CIK with any, or null; `failed` when the SEC couldn't be read."""
    try:
        for cik in body.ciks:
            facts = fundamentals.fetch_company_facts(cik, body.user_agent)
            if facts is not None:
                return {"facts": facts}
    except fundamentals.FetchError as error:
        # Not an HTTP error: the service is fine, the SEC isn't, and the caller tries again another day.
        print(f"[analytics] company facts: {error}")
        return {"facts": None, "failed": True}
    return {"facts": None}


class FactorRefreshRequest(Model):
    source: Source
    universe: Annotated[list[Symbol], Field(min_length=10, max_length=500)]
    """The stocks the factors are built from (MarketLab's catalog)."""


@app.post("/v1/analytics/factors/refresh", dependencies=[Depends(require_token)])
def refresh_factors(body: FactorRefreshRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """Rebuilds the factor returns and every stock's exposures from the stored prices, if any have changed (factors.py)."""
    try:
        return factors.refresh(db, body.source, body.universe)
    except factors.FactorError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


class HoldingValue(Model):
    symbol: Symbol
    value: Annotated[float, Field(ge=0, allow_inf_nan=False)]


class PortfolioFactorsRequest(Model):
    source: Source
    holdings: Annotated[list[HoldingValue], Field(min_length=1, max_length=200)]


@app.post("/v1/analytics/portfolio/factors", dependencies=[Depends(require_token)])
def portfolio_factors(body: PortfolioFactorsRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """A portfolio's factor exposures, holding today's weights over the past year (factors.py)."""
    try:
        return {"factors": factors.portfolio_exposures(db, body.source, [(h.symbol, h.value) for h in body.holdings])}
    except factors.FactorError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


class PlanRequest(Model):
    source: Source
    holdings: Annotated[list[HoldingValue], Field(max_length=30)]
    cash: Annotated[float, Field(ge=0, le=1e12, allow_inf_nan=False)] = 0.0
    monthly: Annotated[float, Field(ge=-1e7, le=1e7, allow_inf_nan=False)] = 0.0
    """Added at each month's end; negative for a withdrawal."""
    years: Annotated[int, Field(ge=1, le=plan.MAX_YEARS)] = 10
    target: Annotated[float, Field(gt=0, le=1e12, allow_inf_nan=False)] | None = None
    inflation: bool = False


@app.post("/v1/analytics/plan", dependencies=[Depends(require_token)])
def goal_plan(body: PlanRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """The goal planner (plan.py): the portfolio's projection with monthly contributions or withdrawals, a target and inflation."""
    values: dict[str, float] = {}
    for h in body.holdings:
        values[h.symbol] = values.get(h.symbol, 0.0) + h.value
    bars = store.load_bars(db, body.source, list(values))
    checksum = store.input_checksum(store.series_index(db, body.source, list(values)))
    try:
        result = plan.plan(
            bars, values, body.cash, monthly=body.monthly, years=body.years, target=body.target, inflation=body.inflation,
            seed_text=f"{checksum}:{sorted(values.items())}:{body.cash}:{body.monthly}:{body.years}:{body.inflation}",
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"plan": result}


class ChainRequest(Model):
    source: Source
    symbol: Symbol


@app.post("/v1/options/chain", dependencies=[Depends(require_token)])
def option_chain(body: ChainRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """A simulated option chain for a stock (options.py), priced from its stored prices: its last close and past-year volatility."""
    bars = store.load_bars(db, body.source, [body.symbol]).get(body.symbol)
    if bars is None or bars.empty:
        raise HTTPException(status_code=409, detail=f"There are no stored prices for {body.symbol} yet.")
    rows = db.query("SELECT dividend_yield FROM price_series WHERE source = ? AND symbol = ?", [body.source, body.symbol])
    q = float(rows[0]["dividend_yield"] or 0.0) if rows else 0.0
    try:
        vol = options.volatility_of(bars["adj_close"].tolist())
        return {"chain": options.chain(float(bars["close"].iloc[-1]), vol, int(bars.index[-1]), q=q)}
    except options.OptionError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


class MarksRequest(Model):
    source: Source
    owner_id: Annotated[str, Field(min_length=1, max_length=64)]


@app.post("/v1/options/marks", dependencies=[Depends(require_token)])
def option_marks_for_owner(body: MarksRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """Values one owner's option positions at the latest close (option_marks.py), storing and returning the marks."""
    return option_marks.run(db, body.source, 5000, owner=body.owner_id)


Positive = Annotated[float, Field(gt=0, le=1e7, allow_inf_nan=False)]
Rate = Annotated[float, Field(ge=-0.05, le=0.5, allow_inf_nan=False)]


class PriceRequest(Model):
    kind: Literal["call", "put"]
    spot: Positive
    strike: Positive
    days: Annotated[int, Field(ge=0, le=3650)]
    volatility: Annotated[float, Field(gt=0, le=5, allow_inf_nan=False)]
    rate: Rate = options.RISK_FREE
    dividend_yield: Annotated[float, Field(ge=0, le=0.5, allow_inf_nan=False)] = 0.0


@app.post("/v1/options/price", dependencies=[Depends(require_token)])
def option_price(body: PriceRequest) -> dict:
    """Black-Scholes price and Greeks for one option."""
    try:
        return options.black_scholes(body.kind, body.spot, body.strike, body.days / 365, body.volatility, body.rate, body.dividend_yield)
    except options.OptionError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


class ImpliedVolRequest(Model):
    kind: Literal["call", "put"]
    price: Positive
    spot: Positive
    strike: Positive
    days: Annotated[int, Field(ge=1, le=3650)]
    rate: Rate = options.RISK_FREE
    dividend_yield: Annotated[float, Field(ge=0, le=0.5, allow_inf_nan=False)] = 0.0


@app.post("/v1/options/implied-volatility", dependencies=[Depends(require_token)])
def implied_volatility(body: ImpliedVolRequest) -> dict:
    """The volatility at which Black-Scholes gives this price."""
    try:
        vol = options.implied_volatility(body.kind, body.price, body.spot, body.strike, body.days / 365, body.rate, body.dividend_yield)
    except options.OptionError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"volatility": vol}


class LegIn(Model):
    kind: Literal["call", "put", "stock"]
    side: Literal["long", "short"]
    quantity: Annotated[float, Field(gt=0, le=1e6, allow_inf_nan=False)]
    strike: Positive | None = None
    premium: Annotated[float, Field(ge=0, le=1e7, allow_inf_nan=False)] | None = None
    price: Positive | None = None

    @model_validator(mode="after")
    def complete(self):
        if self.kind == "stock" and self.price is None:
            raise ValueError("a stock leg needs its price")
        if self.kind != "stock" and (self.strike is None or self.premium is None):
            raise ValueError("an option leg needs its strike and premium")
        return self


class PayoffRequest(Model):
    spot: Positive
    legs: Annotated[list[LegIn], Field(min_length=1, max_length=6)]


@app.post("/v1/options/payoff", dependencies=[Depends(require_token)])
def option_payoff(body: PayoffRequest) -> dict:
    """Profit at expiry across stock prices for a strategy's legs, with breakevens and the most it can make or lose."""
    return options.payoff([leg.model_dump() for leg in body.legs], body.spot)


class MLSettingsModel(Model):
    """The machine-learning sandbox's settings (ml.py)."""

    version: Literal[1] = 1
    symbols: Annotated[list[Symbol], Field(min_length=1, max_length=ml.LIMITS["maxSymbols"])]
    features: Annotated[list[Literal[tuple(ml.FEATURES)]], Field(min_length=1, max_length=len(ml.FEATURES))]  # type: ignore[valid-type]
    model: Literal["logistic", "random-forest", "gradient-boosting"]
    start: int
    end: int
    train_years: Annotated[int, Field(ge=1, le=3)] = 2
    test_months: Annotated[int, Field(ge=1, le=6)] = 3
    cost_bps: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)] = 10.0
    seed: Annotated[int, Field(ge=0, le=1_000_000)] = 7

    def settings(self) -> ml.Settings:
        return ml.Settings(
            symbols=list(dict.fromkeys(self.symbols)), features=list(dict.fromkeys(self.features)), model=self.model, start=self.start, end=self.end,
            train_years=self.train_years, test_months=self.test_months, cost_bps=self.cost_bps, seed=self.seed,
        )


class MLRunRequest(Model):
    source: Source
    settings: MLSettingsModel


def _ml(db: database.Database, source: str, settings: MLSettingsModel) -> tuple[dict, dict]:
    try:
        snap = ml.snapshot(db, source, settings.settings())
        result = ml.run(ml.bars_of(snap), settings.settings())
    except ml.MLError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    result["provenance"] = ml.provenance(snap)
    return snap, result


@app.post("/v1/ml/run", dependencies=[Depends(require_token)])
def ml_run(body: MLRunRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """Trains and walk-forward tests a model on the stored prices (ml.py). Nothing is saved."""
    _snap, result = _ml(db, body.source, body.settings)
    return {"result": result}


class MLSaveRequest(Model):
    owner_id: OwnerId
    run: SavedRunInfo
    source: Source
    settings: MLSettingsModel


@app.post("/v1/ml/saved", dependencies=[Depends(require_token)])
def ml_save(body: MLSaveRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """Runs the sandbox on the stored prices and saves the result, with the exact prices it used, for `ownerId`."""
    snap, result = _ml(db, body.source, body.settings)
    dataset = result["provenance"]["dataset"]
    summary = ml.summary_of(result)
    ok = database.save_run(
        db, body.owner_id, run_id=body.run.id, name=body.run.name, created_at=body.run.created_at,
        config_json=json.dumps(body.settings.model_dump(by_alias=True)), summary_json=json.dumps(summary),
        result_json=json.dumps(result, allow_nan=False), snapshot_json=json.dumps(snap, allow_nan=False),
        checksum=dataset["checksum"], source=body.source, simulated=dataset["simulated"], as_of=dataset["asOf"],
        engine="python-ml", engine_version=ml.ML_VERSION, dataset_version=dataset["datasetVersion"], kind="ml",
    )
    if not ok:
        if not db.query("SELECT 1 FROM user WHERE id = ?", [body.owner_id]):
            raise HTTPException(status_code=404, detail="That account doesn't exist.")
        raise HTTPException(status_code=409, detail=f"You can save up to {database.MAX_SAVED_RUNS} runs. Delete one to make room.")
    return {"summary": summary, "result": result}


@app.post("/v1/ml/saved/{run_id}/reproduce", dependencies=[Depends(require_token)])
def ml_reproduce(run_id: Annotated[str, Path(min_length=1, max_length=64)], body: OwnerRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """Reads one of the owner's saved sandbox runs, trains and tests it again from its saved prices alone, and compares."""
    row = database.load_saved_run(db, body.owner_id, run_id)
    if row is None or row["kind"] != "ml":
        raise HTTPException(status_code=404, detail="That saved run doesn't exist.")
    stored = json.loads(row["result"])
    snap = json.loads(row["snapshot"])
    try:
        settings = MLSettingsModel.model_validate(json.loads(row["config"])).settings()
        reproduced = ml.run(ml.bars_of(snap), settings)
    except ml.MLError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    reproduced["provenance"] = ml.provenance(snap)
    comparison = ml.compare(stored, reproduced)
    was, now = stored["provenance"]["method"], reproduced["provenance"]["method"]
    if was != now:
        comparison["differences"] = [f"Calculated with version {was['version']} (scikit-learn {was['scikitLearn']}); reproduced with {now['version']} (scikit-learn {now['scikitLearn']}).", *comparison["differences"]][:5]
    return {"reproduced": reproduced, "comparison": comparison}


class NightlyRequest(Model):
    source: Source
    universe: Annotated[list[Symbol], Field(min_length=10, max_length=500)]
    budget_ms: Annotated[int, Field(ge=1000, le=50_000)] = 20_000
    parts: list[Literal["alerts", "marks", "snapshots", "profiles", "factors"]] | None = None


@app.post("/v1/jobs/nightly", dependencies=[Depends(require_token)])
def nightly(body: NightlyRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """The nightly calculations (jobs.run_nightly): indicator alerts, portfolio snapshots, stock profiles and factors, within a time budget."""
    return jobs.run_nightly(db, body.source, body.universe, body.budget_ms, body.parts or jobs.NIGHTLY_PARTS)


class CatalogEntry(Model):
    symbol: Symbol
    name: Annotated[str, Field(max_length=200)]
    sector: Annotated[str, Field(max_length=100)]


class ScreenerRowsRequest(Model):
    source: Source
    catalog: Annotated[list[CatalogEntry], Field(min_length=1, max_length=500)]
    now: int
    """The time (ms) SEC numbers are judged current against."""


@app.post("/v1/analytics/screener-rows", dependencies=[Depends(require_token)])
def screener_rows(body: ScreenerRowsRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """The screener's rows from the stored profiles, price-store numbers and SEC facts (screener.py)."""
    return screener.rows_from_store(db, body.source, [c.model_dump() for c in body.catalog], body.now)


class RatiosRequest(Model):
    facts: dict
    price: Annotated[float, Field(gt=0, allow_inf_nan=False)]
    market_cap: Annotated[float, Field(gt=0, allow_inf_nan=False)] | None = None
    now: int


@app.post("/v1/fundamentals/ratios", dependencies=[Depends(require_token)])
def fundamentals_ratios(body: RatiosRequest) -> dict:
    """Ratios from a company's reported numbers at a price, and whether the numbers are current (fundamentals.py)."""
    try:
        return {"ratios": fundamentals.ratios_of(body.facts, body.price, body.market_cap), "current": fundamentals.is_current(body.facts, body.now)}
    except (KeyError, TypeError, ValueError, IndexError) as error:
        raise HTTPException(status_code=422, detail=f"Those company numbers couldn't be read: {error}") from error


@app.post("/v1/backtests/walk-forward", dependencies=[Depends(require_token)])
def walk_forward(body: WalkForwardRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """Walk-forward test of a moving-average crossover on the stored prices (the Next.js server stores them first)."""
    if body.config.strategy.kind != "moving-average":
        raise HTTPException(status_code=422, detail="Walk-forward testing is available for the moving-average crossover.")
    symbols = [h.symbol for h in body.config.holdings]
    # Only the chosen period, plus room for the longest average to warm up on earlier sessions
    # (trading days are about 5/7 of calendar days; the margin covers holidays).
    longest = max(body.slow.to, body.config.strategy.slow)
    bars = store.load_bars(db, body.source, symbols, since=body.config.start - int((longest * 1.6 + 20) * 86_400_000))
    missing = [s for s in symbols if s not in bars]
    if missing:
        raise HTTPException(status_code=422, detail=f"No stored prices for {', '.join(missing)}.")
    prices = {s: pd.Series(bars[s]["adj_close"].to_numpy(), index=bars[s].index, name=s) for s in symbols}
    try:
        result = walkforward.walk_forward(
            prices,
            to_engine_config(body.config),
            walkforward.Grid(fast=body.fast.values(), slow=body.slow.values()),
            train_sessions=body.train_years * 252,
            test_sessions=body.test_months * 21,
        )
    except engine.InputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    index = store.series_index(db, body.source, symbols)
    return {"result": result, "inputChecksum": store.input_checksum(index), "engine": {"name": engine.ENGINE_NAME, "version": engine.ENGINE_VERSION}}


# --- Historical screens (analytics/screens.py) -------------------------------------


class ScreenConfigModel(Model):
    """A historical screen's settings, as MarketLab saves them (lib/screens/config.ts)."""

    version: Literal[1]
    preset: Literal["momentum"]
    start: int
    end: int
    initial_cash: Annotated[float, Field(ge=100, le=10_000_000, allow_inf_nan=False)]
    costs: CostsModel
    universe: Annotated[list[Symbol], Field(min_length=1, max_length=screens.MAX_UNIVERSE)]

    @model_validator(mode="after")
    def check(self):
        if self.start >= self.end:
            raise ValueError("the start must be before the end")
        if len(set(self.universe)) != len(self.universe):
            raise ValueError("each candidate may appear once")
        return self

    def settings(self) -> screens.Settings:
        return screens.Settings(self.start, self.end, self.initial_cash, engine.Costs(self.costs.commission, self.costs.slippage_bps))


class ScreenRequest(Model):
    source: Source
    config: ScreenConfigModel


class SaveScreenRequest(Model):
    owner_id: OwnerId
    run: SavedRunInfo
    source: Source
    config: ScreenConfigModel


def _screen(db: database.Database, source: str, config: ScreenConfigModel) -> tuple[dict, dict]:
    try:
        snapshot = saved.screen_snapshot(db, source, config.universe, config.settings())
        return snapshot, saved.screen_result(snapshot, config.settings())
    except engine.InputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/v1/screens/history", dependencies=[Depends(require_token)])
def screen_history(body: ScreenRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """Applies the screen at the start of every month from the stored prices, using only what was known then. Nothing is saved."""
    _snapshot, result = _screen(db, body.source, body.config)
    return {"result": result}


@app.post("/v1/saved-screens", dependencies=[Depends(require_token)])
def save_screen(body: SaveScreenRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """Calculates a historical screen from the stored prices and saves it, with its snapshot, for `ownerId`."""
    snapshot, result = _screen(db, body.source, body.config)
    dataset = result["provenance"]["dataset"]
    summary = screens.summary_of(result)
    ok = database.save_run(
        db,
        body.owner_id,
        run_id=body.run.id,
        name=body.run.name,
        created_at=body.run.created_at,
        config_json=json.dumps(body.config.model_dump(by_alias=True)),
        summary_json=json.dumps(summary),
        result_json=json.dumps(result, allow_nan=False),
        snapshot_json=json.dumps(snapshot, allow_nan=False),
        checksum=dataset["checksum"],
        source=body.source,
        simulated=dataset["simulated"],
        as_of=dataset["asOf"],
        engine=engine.ENGINE_NAME,
        engine_version=engine.ENGINE_VERSION,
        dataset_version=dataset["datasetVersion"],
        kind="historical-screen",
    )
    if not ok:
        if not db.query("SELECT 1 FROM user WHERE id = ?", [body.owner_id]):
            raise HTTPException(status_code=404, detail="That account doesn't exist.")
        raise HTTPException(status_code=409, detail=f"You can save up to {database.MAX_SAVED_RUNS} runs. Delete one to make room.")
    return {"summary": summary, "result": result}


@app.post("/v1/saved-screens/{run_id}/reproduce", dependencies=[Depends(require_token)])
def reproduce_screen(run_id: Annotated[str, Path(min_length=1, max_length=64)], body: OwnerRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """Reads one of the owner's saved historical screens, calculates it again from its saved prices alone, and compares."""
    try:
        return saved.reproduce_screen(db, body.owner_id, run_id, lambda config: ScreenConfigModel.model_validate(config).settings())
    except saved.NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except saved.NotReproducible as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except engine.InputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


# --- Pairs trading (pairs.py) ------------------------------------------------------

YEAR_MS = 366 * 86_400_000


class PairStock(Model):
    symbol: Symbol
    sector: Annotated[str, Field(max_length=60)] | None = None


class PairScanRequest(Model):
    source: Source
    universe: Annotated[list[PairStock], Field(min_length=2, max_length=200)]
    """The stocks to pair up (the Next.js server's catalog), with their sectors: only same-sector pairs are tested."""
    formation_end: int


@app.post("/v1/pairs/scan", dependencies=[Depends(require_token)])
def pair_scan(body: PairScanRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """Every same-sector pair tested for cointegration over the formation year to `formationEnd`, best first (pairs.py)."""
    symbols = list(dict.fromkeys(s.symbol for s in body.universe))
    closes = store.load_closes(db, body.source, symbols, body.formation_end - 2 * YEAR_MS, body.formation_end)
    try:
        return {"result": pairs.scan(closes, {s.symbol: s.sector or "Other" for s in body.universe}, body.formation_end)}
    except pairs.PairError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


class PairBacktestRequest(Model):
    source: Source
    a: Symbol
    b: Symbol
    formation_end: int
    entry: Annotated[float, Field(ge=0.5, le=4, allow_inf_nan=False)] = 2.0
    exit: Annotated[float, Field(ge=0, le=3, allow_inf_nan=False)] = 0.0
    stop: Annotated[float, Field(ge=1, le=8, allow_inf_nan=False)] = 4.0
    initial_cash: Annotated[float, Field(ge=100, le=10_000_000, allow_inf_nan=False)] = 10_000.0
    costs: CostsModel
    borrow_bps: Annotated[float, Field(ge=0, le=2000, allow_inf_nan=False)] = 50.0

    @model_validator(mode="after")
    def different(self):
        if self.a == self.b:
            raise ValueError("a pair needs two different stocks")
        return self


@app.post("/v1/pairs/backtest", dependencies=[Depends(require_token)])
def pair_backtest(body: PairBacktestRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """One pair's gap traded over the year after its formation year, with the formation's numbers only (pairs.py)."""
    closes = store.load_closes(db, body.source, [body.a, body.b], body.formation_end - 2 * YEAR_MS, body.formation_end + 2 * YEAR_MS)
    missing = [s for s in (body.a, body.b) if s not in closes]
    if missing:
        raise HTTPException(status_code=422, detail=f"No stored prices for {', '.join(missing)}.")
    try:
        result = pairs.backtest(
            closes[body.a], closes[body.b], body.formation_end, names=(body.a, body.b),
            entry=body.entry, exit=body.exit, stop=body.stop, initial_cash=body.initial_cash,
            commission=body.costs.commission, slippage_bps=body.costs.slippage_bps, borrow_bps=body.borrow_bps,
        )
    except pairs.PairError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"result": {**result, "a": body.a, "b": body.b, "metrics": MetricsModel(**result["metrics"].__dict__).model_dump(by_alias=True)}}


# --- How stocks move together (correlation.py) -----------------------------------------


class CorrelationRequest(Model):
    source: Source
    symbols: Annotated[list[Symbol], Field(min_length=2, max_length=30)]


@app.post("/v1/analytics/correlation", dependencies=[Depends(require_token)])
def stock_correlation(body: CorrelationRequest, db: Annotated[database.Database, Depends(get_database)]) -> dict:
    """The last year's daily-return correlations of these stocks (the watchlist's), clustered (correlation.py)."""
    symbols = list(dict.fromkeys(body.symbols))
    bars = store.load_bars(db, body.source, symbols)
    usable = [s for s in symbols if s in bars and len(bars[s]) >= 60]
    if len(usable) < 2:
        raise HTTPException(status_code=422, detail="At least two of these stocks need a few months of prices to compare.")
    closes = pd.concat({s: bars[s]["adj_close"] for s in usable}, axis=1, join="inner").sort_index()
    returns = closes.pct_change().iloc[1:].iloc[-portfolio.TRADING_DAYS :]
    return {"symbols": usable, "leftOut": [s for s in symbols if s not in usable], "asOf": int(returns.index[-1]), **correlation.summary(returns)}
