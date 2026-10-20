"""
The analytics service's HTTP API (FastAPI). It only translates between JSON
and the engine (analytics/engine.py), which does all the calculating.

Only MarketLab's Next.js server calls it: requests carry the shared secret
ANALYTICS_SERVICE_TOKEN as a bearer token, and the prices come from the
Next.js server's own market data, never from a browser.

    GET  /health        Liveness, and the engine version. No token needed.
    POST /v1/backtests  Runs one backtest. See BacktestRequest / BacktestResponse.
"""

from __future__ import annotations

import hmac
import math
import os
from typing import Annotated, Literal, Union

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

from . import engine

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


class CostsModel(Model):
    commission: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]
    slippage_bps: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]


class ConfigModel(Model):
    """MarketLab's BacktestConfig (lib/backtest/config.ts), for the strategies this service runs."""

    version: Annotated[int, Field(ge=1, le=2)]
    holdings: Annotated[list[Holding], Field(min_length=1, max_length=5)]
    strategy: Annotated[Union[BuyAndHold, MovingAverage], Field(discriminator="kind")]
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
        return self


class SeriesModel(Model):
    """Daily closes: parallel lists of timestamps (ms) and prices, oldest first."""

    times: Annotated[list[int], Field(min_length=1, max_length=engine.MAX_POINTS)]
    # Non-finite numbers are refused here; ordering, duplicates and positivity by engine.to_series.
    prices: Annotated[list[float], Field(min_length=1, max_length=engine.MAX_POINTS)]

    @field_validator("prices")
    @classmethod
    def finite(cls, prices: list[float]) -> list[float]:
        if not all(math.isfinite(p) for p in prices):
            raise ValueError("every price must be a finite number")
        return prices


class BacktestRequest(Model):
    config: ConfigModel
    prices: Annotated[dict[str, SeriesModel], Field(min_length=1, max_length=5)]
    """Each holding's adjusted daily closes."""
    market: SeriesModel | None = None
    """The market index, needed when the benchmark is "market"."""


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


class RunModel(Model):
    equity: list[Point]
    trades: list[TradeModel]
    metrics: MetricsModel


class EngineInfo(Model):
    name: str
    version: str


class BacktestResponse(Model):
    engine: EngineInfo
    run: RunModel
    benchmark: RunModel
    warnings: list[str]


def _run_model(run: engine.Run) -> RunModel:
    return RunModel(
        equity=[Point(time=t, price=v) for t, v in run.equity],
        trades=[TradeModel(**t.__dict__) for t in run.trades],
        metrics=MetricsModel(**run.metrics.__dict__),
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


@app.post("/v1/backtests", response_model=BacktestResponse, response_model_by_alias=True, dependencies=[Depends(require_token)])
def run_backtest(body: BacktestRequest) -> BacktestResponse:
    c = body.config
    try:
        prices = {symbol: engine.to_series(symbol, s.times, s.prices) for symbol, s in body.prices.items()}
        market = engine.to_series("Market", body.market.times, body.market.prices) if body.market else None
        config = engine.Config(
            holdings=[(h.symbol, h.weight) for h in c.holdings],
            strategy=c.strategy.kind,
            start=c.start,
            end=c.end,
            initial_cash=c.initial_cash,
            costs=engine.Costs(commission=c.costs.commission, slippage_bps=c.costs.slippage_bps),
            benchmark=c.benchmark,
            fast=getattr(c.strategy, "fast", None),
            slow=getattr(c.strategy, "slow", None),
        )
        outcome = engine.run_config(config, prices, market)
    except engine.InputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return BacktestResponse(
        engine=EngineInfo(name=engine.ENGINE_NAME, version=engine.ENGINE_VERSION),
        run=_run_model(outcome.run),
        benchmark=_run_model(outcome.benchmark),
        warnings=outcome.warnings,
    )
