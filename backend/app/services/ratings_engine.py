"""
Rating algorithms: Ratings Central (RC) and Glicko-2.
Both use period-based batch updates: games are grouped by date, and all
results within a period are processed simultaneously using pre-period ratings.
This matches the design intent of RC/Glicko and avoids the instability caused
by sequential per-game updates with high initial uncertainty.
"""
import math
from itertools import groupby
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
        _rc_g(r['sd_opp']) ** 2
        * _rc_e(rating, r['r_opp'], r['sd_opp'])
        * (1 - _rc_e(rating, r['r_opp'], r['sd_opp']))
        for r in results
    )
    if d_sq_inv == 0:
        return rating, sd
    d_sq = 1.0 / d_sq_inv
    delta = RC_ALPHA * d_sq * sum(
        _rc_g(r['sd_opp']) * (r['score'] - _rc_e(rating, r['r_opp'], r['sd_opp']))
        for r in results
    )
    new_sd = max(math.sqrt(1.0 / (1.0 / sd ** 2 + 1.0 / d_sq)), RC_MIN_SD)
    return rating + delta, new_sd


def _game_stats(match_games, for_team1: bool) -> tuple[int, int]:
    """Return (individual_wins, individual_losses) for the given side."""
    wins, losses = 0, 0
    for game in match_games:
        if game.team1Score == 0 and game.team2Score == 0:
            continue
        t1_won = game.team1Score > game.team2Score
        if (for_team1 and t1_won) or (not for_team1 and not t1_won):
            wins += 1
        else:
            losses += 1
    return wins, losses


def compute_rc_ratings(games: list[BaselineGame], gtype: str) -> list[PlayerRatingEntry]:
    state: dict[str, PlayerRatingEntry] = {}

    def get(name: str) -> PlayerRatingEntry:
        if name not in state:
            state[name] = PlayerRatingEntry(
                name=name, rating=RC_INITIAL_RATING, uncertainty=RC_INITIAL_SD,
                won=0, lost=0, gamesPlayed=0,
            )
        return state[name]

    filtered = sorted(
        [g for g in games if g.type == gtype],
        key=lambda g: (g.date or '', g.createdAt),
    )

    for _, period_iter in groupby(filtered, key=lambda g: g.date or ''):
        period = list(period_iter)

        # Snapshot all ratings at the start of this period
        snap: dict[str, PlayerRatingEntry] = {}
        for g in period:
            for name in g.team1 + g.team2:
                if name not in snap:
                    snap[name] = get(name).model_copy()

        # Collect every result per player using snapshot (pre-period) opponent ratings
        results_map: dict[str, list[dict]] = {}
        wins_map: dict[str, int] = {}
        losses_map: dict[str, int] = {}

        for g in period:
            team1_won = g.winner == 1
            for my_team, opp_team, won, is_team1 in [
                (g.team1, g.team2, team1_won, True),
                (g.team2, g.team1, not team1_won, False),
            ]:
                opp_snaps = [snap.get(opp) or get(opp) for opp in opp_team]
                avg_r = sum(s.rating for s in opp_snaps) / len(opp_snaps)
                avg_sd = sum(s.uncertainty for s in opp_snaps) / len(opp_snaps)
                gw, gl = _game_stats(g.games, is_team1)
                for name in my_team:
                    if name not in results_map:
                        results_map[name] = []
                        wins_map[name] = 0
                        losses_map[name] = 0
                    results_map[name].append({
                        'r_opp': avg_r,
                        'sd_opp': avg_sd,
                        'score': 1.0 if won else 0.0,  # match outcome drives rating
                    })
                    wins_map[name] += gw
                    losses_map[name] += gl

        # One batch update per player for the whole period
        for name, results in results_map.items():
            p = snap[name]
            new_r, new_sd = _rc_update(p.rating, p.uncertainty, results)
            cur = get(name)
            state[name] = PlayerRatingEntry(
                name=name, rating=new_r, uncertainty=new_sd,
                won=cur.won + wins_map[name],
                lost=cur.lost + losses_map[name],
                gamesPlayed=cur.gamesPlayed + wins_map[name] + losses_map[name],
            )

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
    B = math.log(d_sq - phi_sq - v) if d_sq > phi_sq + v else a - G2_TAU
    if not d_sq > phi_sq + v:
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
        return mu, math.sqrt(phi ** 2 + sigma ** 2), sigma

    v = 1.0 / sum(
        _g2_g(r['phi_j']) ** 2
        * _g2_e(mu, r['mu_j'], r['phi_j'])
        * (1 - _g2_e(mu, r['mu_j'], r['phi_j']))
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


def compute_glicko2_ratings(games: list[BaselineGame], gtype: str) -> list[PlayerRatingEntry]:
    # state: name → (entry, (mu, phi, sigma))
    state: dict[str, tuple[PlayerRatingEntry, tuple[float, float, float]]] = {}

    def get(name: str) -> tuple[PlayerRatingEntry, tuple[float, float, float]]:
        if name not in state:
            g2 = (0.0, G2_INIT_RD / G2_SCALE, G2_INIT_SIGMA)
            state[name] = (PlayerRatingEntry(
                name=name, rating=G2_INIT_R, uncertainty=G2_INIT_RD,
                volatility=G2_INIT_SIGMA, won=0, lost=0, gamesPlayed=0,
            ), g2)
        return state[name]

    filtered = sorted(
        [g for g in games if g.type == gtype],
        key=lambda g: (g.date or '', g.createdAt),
    )

    for _, period_iter in groupby(filtered, key=lambda g: g.date or ''):
        period = list(period_iter)

        # Snapshot g2 internal state at start of period
        snap_g2: dict[str, tuple[float, float, float]] = {}
        for g in period:
            for name in g.team1 + g.team2:
                if name not in snap_g2:
                    snap_g2[name] = get(name)[1]

        # Collect results per player using snapshot opponent g2 state
        results_map: dict[str, list[dict]] = {}
        wins_map: dict[str, int] = {}
        losses_map: dict[str, int] = {}

        for g in period:
            team1_won = g.winner == 1
            for my_team, opp_team, won, is_team1 in [
                (g.team1, g.team2, team1_won, True),
                (g.team2, g.team1, not team1_won, False),
            ]:
                opp_g2s = [snap_g2.get(opp) or get(opp)[1] for opp in opp_team]
                avg_mu = sum(s[0] for s in opp_g2s) / len(opp_g2s)
                avg_phi = sum(s[1] for s in opp_g2s) / len(opp_g2s)
                gw, gl = _game_stats(g.games, is_team1)
                for name in my_team:
                    if name not in results_map:
                        results_map[name] = []
                        wins_map[name] = 0
                        losses_map[name] = 0
                    results_map[name].append({
                        'mu_j': avg_mu,
                        'phi_j': avg_phi,
                        'score': 1.0 if won else 0.0,  # match outcome drives rating
                    })
                    wins_map[name] += gw
                    losses_map[name] += gl

        # One batch update per player
        for name, results in results_map.items():
            mu, phi, sigma = snap_g2[name]
            new_mu, new_phi, new_sigma = _g2_update(mu, phi, sigma, results)
            new_rating = G2_SCALE * new_mu + G2_INIT_R
            new_rd = G2_SCALE * new_phi
            cur_entry, _ = get(name)
            state[name] = (
                PlayerRatingEntry(
                    name=name, rating=new_rating, uncertainty=new_rd, volatility=new_sigma,
                    won=cur_entry.won + wins_map[name],
                    lost=cur_entry.lost + losses_map[name],
                    gamesPlayed=cur_entry.gamesPlayed + wins_map[name] + losses_map[name],
                ),
                (new_mu, new_phi, new_sigma),
            )

    return sorted((v[0] for v in state.values()), key=lambda r: -r.rating)
