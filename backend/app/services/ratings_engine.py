"""
Baseline rating algorithms: Ratings Central (RC) and Glicko-2.
Ported from app/src/rankings.ts.
"""
import math
from ..models.tournament import BaselineGame, PlayerRatingEntry

# ---------------------------------------------------------------------------
# Ratings Central
# ---------------------------------------------------------------------------
RC_ALPHA = 0.0148540595817432
RC_INITIAL_RATING = 1400.0
RC_INITIAL_SD = 450.0
RC_MIN_SD = 50.0


def _rc_g(sd: float) -> float:
    return 1.0 / math.sqrt(1 + 3 * RC_ALPHA ** 2 * sd ** 2 / (math.pi ** 2))


def _rc_e(r: float, r_opp: float, sd_opp: float) -> float:
    x = _rc_g(sd_opp) * RC_ALPHA * (r - r_opp)
    x = max(-500.0, min(500.0, x))
    return 1.0 / (1 + math.exp(-x))


def _rc_update(rating: float, sd: float, results: list[dict]) -> tuple[float, float]:
    if not results:
        return rating, sd
    d_sq_inv = RC_ALPHA ** 2 * sum(
        _rc_g(r['sd_opp']) ** 2 * _rc_e(rating, r['r_opp'], r['sd_opp']) * (1 - _rc_e(rating, r['r_opp'], r['sd_opp']))
        for r in results
    )
    if d_sq_inv == 0:
        return rating, sd
    d_sq = 1.0 / d_sq_inv
    delta = RC_ALPHA * d_sq * sum(
        _rc_g(r['sd_opp']) * (r['score'] - _rc_e(rating, r['r_opp'], r['sd_opp']))
        for r in results
    )
    new_rating = rating + delta
    new_sd = max(math.sqrt(1.0 / (1.0 / (sd ** 2) + 1.0 / d_sq)), RC_MIN_SD)
    return new_rating, new_sd


def _apply_rc_game(state: dict[str, PlayerRatingEntry], game: BaselineGame) -> None:
    team1_won = game.winner == 1

    def get(name: str) -> PlayerRatingEntry:
        if name not in state:
            state[name] = PlayerRatingEntry(
                name=name, rating=RC_INITIAL_RATING, uncertainty=RC_INITIAL_SD,
                won=0, lost=0, gamesPlayed=0,
            )
        return state[name]

    pre: dict[str, PlayerRatingEntry] = {}
    for n in game.team1 + game.team2:
        e = get(n)
        pre[n] = e.model_copy()

    def update(name: str, opponents: list[str], won: bool) -> None:
        p = pre[name]
        results = [
            {'r_opp': pre[opp].rating, 'sd_opp': pre[opp].uncertainty, 'score': 1.0 if won else 0.0}
            for opp in opponents
        ]
        new_r, new_sd = _rc_update(p.rating, p.uncertainty, results)
        cur = get(name)
        state[name] = PlayerRatingEntry(
            name=name, rating=new_r, uncertainty=new_sd,
            won=cur.won + (1 if won else 0),
            lost=cur.lost + (0 if won else 1),
            gamesPlayed=cur.gamesPlayed + 1,
        )

    if game.type != 'doubles':
        update(game.team1[0], game.team2, team1_won)
        update(game.team2[0], game.team1, not team1_won)
    else:
        for n in game.team1:
            update(n, game.team2, team1_won)
        for n in game.team2:
            update(n, game.team1, not team1_won)


def compute_rc_ratings(games: list[BaselineGame], gtype: str) -> list[PlayerRatingEntry]:
    state: dict[str, PlayerRatingEntry] = {}
    for g in sorted((g for g in games if g.type == gtype), key=lambda g: g.createdAt):
        _apply_rc_game(state, g)
    return sorted(state.values(), key=lambda r: -r.rating)


# ---------------------------------------------------------------------------
# Glicko-2
# ---------------------------------------------------------------------------
G2_SCALE = 173.7178
G2_INIT_R = 1500.0
G2_INIT_RD = 350.0
G2_INIT_SIGMA = 0.06
G2_TAU = 0.5
G2_MIN_RD = 30.0
G2_EPSILON = 0.000001


def _g2_g(phi: float) -> float:
    return 1.0 / math.sqrt(1 + 3 * phi ** 2 / (math.pi ** 2))


def _g2_e(mu: float, mu_j: float, phi_j: float) -> float:
    x = _g2_g(phi_j) * (mu - mu_j)
    x = max(-500.0, min(500.0, x))
    return 1.0 / (1 + math.exp(-x))


def _g2_new_sigma(phi: float, sigma: float, v: float, delta: float) -> float:
    a = math.log(sigma ** 2)
    d_sq = delta ** 2
    phi_sq = phi ** 2

    def f(x: float) -> float:
        ex = math.exp(x)
        return (ex * (d_sq - phi_sq - v - ex)) / (2 * (phi_sq + v + ex) ** 2) - (x - a) / (G2_TAU ** 2)

    A = a
    if d_sq > phi_sq + v:
        B = math.log(d_sq - phi_sq - v)
    else:
        k = 1
        while f(a - k * G2_TAU) < 0:
            k += 1
        B = a - k * G2_TAU

    f_A, f_B = f(A), f(B)
    while abs(B - A) > G2_EPSILON:
        C = A + (A - B) * f_A / (f_B - f_A)
        f_C = f(C)
        if f_C * f_B < 0:
            A, f_A = B, f_B
        else:
            f_A /= 2
        B, f_B = C, f_C
    return math.exp(A / 2)


def _g2_update(mu: float, phi: float, sigma: float, results: list[dict]) -> tuple[float, float, float]:
    if not results:
        phi_star = min(math.sqrt(phi ** 2 + sigma ** 2), G2_INIT_RD / G2_SCALE)
        return mu, phi_star, sigma

    v = 1.0 / sum(
        _g2_g(r['phi_j']) ** 2 * _g2_e(mu, r['mu_j'], r['phi_j']) * (1 - _g2_e(mu, r['mu_j'], r['phi_j']))
        for r in results
    )
    delta = v * sum(
        _g2_g(r['phi_j']) * (r['score'] - _g2_e(mu, r['mu_j'], r['phi_j']))
        for r in results
    )
    new_sigma = _g2_new_sigma(phi, sigma, v, delta)
    phi_star = math.sqrt(phi ** 2 + new_sigma ** 2)
    new_phi = max(1.0 / math.sqrt(1.0 / phi_star ** 2 + 1.0 / v), G2_MIN_RD / G2_SCALE)
    new_mu = mu + new_phi ** 2 * sum(
        _g2_g(r['phi_j']) * (r['score'] - _g2_e(mu, r['mu_j'], r['phi_j']))
        for r in results
    )
    return new_mu, new_phi, new_sigma


def _apply_g2_game(
    state: dict[str, tuple[PlayerRatingEntry, tuple[float, float, float]]],
    game: BaselineGame,
) -> None:
    team1_won = game.winner == 1

    def get(name: str) -> tuple[PlayerRatingEntry, tuple[float, float, float]]:
        if name not in state:
            g2 = (0.0, G2_INIT_RD / G2_SCALE, G2_INIT_SIGMA)
            entry = PlayerRatingEntry(
                name=name, rating=G2_INIT_R, uncertainty=G2_INIT_RD,
                volatility=G2_INIT_SIGMA, won=0, lost=0, gamesPlayed=0,
            )
            state[name] = (entry, g2)
        return state[name]

    pre: dict[str, tuple[PlayerRatingEntry, tuple[float, float, float]]] = {}
    for n in game.team1 + game.team2:
        e, g2 = get(n)
        pre[n] = (e.model_copy(), g2)

    def update(name: str, opponents: list[str], won: bool) -> None:
        _, (mu, phi, sigma) = pre[name]
        results = [
            {'mu_j': pre[opp][1][0], 'phi_j': pre[opp][1][1], 'score': 1.0 if won else 0.0}
            for opp in opponents
        ]
        new_mu, new_phi, new_sigma = _g2_update(mu, phi, sigma, results)
        new_rating = G2_SCALE * new_mu + G2_INIT_R
        new_rd = G2_SCALE * new_phi
        cur_entry, _ = get(name)
        state[name] = (
            PlayerRatingEntry(
                name=name, rating=new_rating, uncertainty=new_rd, volatility=new_sigma,
                won=cur_entry.won + (1 if won else 0),
                lost=cur_entry.lost + (0 if won else 1),
                gamesPlayed=cur_entry.gamesPlayed + 1,
            ),
            (new_mu, new_phi, new_sigma),
        )

    if game.type != 'doubles':
        update(game.team1[0], game.team2, team1_won)
        update(game.team2[0], game.team1, not team1_won)
    else:
        for n in game.team1:
            update(n, game.team2, team1_won)
        for n in game.team2:
            update(n, game.team1, not team1_won)


def compute_glicko2_ratings(games: list[BaselineGame], gtype: str) -> list[PlayerRatingEntry]:
    state: dict[str, tuple[PlayerRatingEntry, tuple[float, float, float]]] = {}
    for g in sorted((g for g in games if g.type == gtype), key=lambda g: g.createdAt):
        _apply_g2_game(state, g)
    return sorted((v[0] for v in state.values()), key=lambda r: -r.rating)
