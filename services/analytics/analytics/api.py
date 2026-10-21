"""
The analytics service's HTTP API (FastAPI). It only translates between JSON
and the engine (analytics/engine.py), which does all the calculating.

Only MarketLab's Next.js server calls it: requests carry the shared secret
ANALYTICS_SERVICE_TOKEN as a bearer token, and the prices come from the
Next.js server's own market data, never from a browser.

    GET  /health                             Liveness, and the engine version. No token needed.
    POST /v1/backtests                       Runs one backtest. See BacktestRequest / BacktestResponse.
    POST /v1/saved-runs                      Calculates a run from a snapshot and saves it (database).
    POST /v1/saved-runs/{id}/reproduce       Reads a saved run (database), recalculates it, compares.
    POST /v1/analytics/stock-profiles        Recalculates stored stock profiles that are missing or stale (database).
    POST /v1/analytics/portfolio             Risk, stress tests, Monte Carlo and optimisation for a set of holdings (stored prices).
    POST /v1/backtests/walk-forward          Walk-forward test of a moving-average crossover (stored prices).
"""

from __future__ import annotations

import hmac
import json
import math
import os

import pandas as pd
from typing import Annotated, Literal, Union

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

from . import db as database
from . import engine, jobs, portfolio, saved, store, walkforward

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


class CostsModel(Model):
    commission: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]
    slippage_bps: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]


class ConfigModel(Model):
    """MarketLab's BacktestConfig (lib/backtest/config.ts), for the strategies this service runs."""

    version: Annotated[int, Field(ge=1, le=2)]
    holdings: Annotated[list[Holding], Field(min_length=1, max_length=5)]
    strategy: Annotated[Union[BuyAndHold, MovingAverage, DollarCostAveraging, Rebalancing, RulesStrategy, MomentumRotationModel, RiskParityModel], Field(discriminator="kind")]
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
    return BacktestResponse(
        engine=EngineInfo(name=engine.ENGINE_NAME, version=engine.ENGINE_VERSION),
        run=_run_model(outcome.run, body.include_ledger),
        benchmark=_run_model(outcome.benchmark, body.include_ledger),
        warnings=outcome.warnings,
        assumptions=engine.ASSUMPTIONS,
        warmup=body.warmup,
    )


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
    result = saved.stored_result(outcome, note=body.note, dataset=dataset, assumptions=body.assumptions)
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
    value: Annotated[float, Field(ge=0, le=1e12, allow_inf_nan=False)]
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
