"""Tests for RC and Glicko-2 rating engines."""
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.services.ratings_engine import compute_rc_ratings, compute_glicko2_ratings
from app.models.tournament import RatingGame, Game


def make_game(id: str, team1: list[str], team2: list[str], winner: int,
              gtype='singles', date='2026-01-01', created_at=0) -> RatingGame:
    return RatingGame(
        id=id, type=gtype, team1=team1, team2=team2,
        winner=winner, setCount=1, date=date, createdAt=created_at,
        games=[Game(team1Score=11 if winner == 1 else 5, team2Score=5 if winner == 1 else 11)],
    )


# ---------------------------------------------------------------------------
# RC
# ---------------------------------------------------------------------------

class TestRCRatings:
    def test_winner_gains_rating(self):
        games = [make_game('g1', ['Alice'], ['Bob'], winner=1)]
        results = compute_rc_ratings(games, 'singles')
        alice = next(r for r in results if r.name == 'Alice')
        bob = next(r for r in results if r.name == 'Bob')
        assert alice.rating > 1400
        assert bob.rating < 1400

    def test_consistently_stronger_player_ranks_first(self):
        games = [
            make_game('g1', ['Strong'], ['Weak'], winner=1, date='2026-01-01'),
            make_game('g2', ['Strong'], ['Weak'], winner=1, date='2026-01-02'),
            make_game('g3', ['Strong'], ['Weak'], winner=1, date='2026-01-03'),
        ]
        results = compute_rc_ratings(games, 'singles')
        assert results[0].name == 'Strong'

    def test_win_loss_counts(self):
        games = [make_game('g1', ['Alice'], ['Bob'], winner=1)]
        results = compute_rc_ratings(games, 'singles')
        alice = next(r for r in results if r.name == 'Alice')
        bob = next(r for r in results if r.name == 'Bob')
        assert alice.won == 1 and alice.lost == 0
        assert bob.won == 0 and bob.lost == 1

    def test_equal_records_tracked(self):
        # Sequential wins/losses: ratings diverge due to order, but records should be 1-1
        games = [
            make_game('g1', ['A'], ['B'], winner=1, date='2026-01-01'),
            make_game('g2', ['B'], ['A'], winner=1, date='2026-01-02'),
        ]
        results = compute_rc_ratings(games, 'singles')
        a = next(r for r in results if r.name == 'A')
        b = next(r for r in results if r.name == 'B')
        assert a.won == 1 and a.lost == 1
        assert b.won == 1 and b.lost == 1

    def test_type_filter(self):
        games = [
            make_game('g1', ['Alice'], ['Bob'], winner=1, gtype='singles'),
            make_game('g2', ['Alice'], ['Bob'], winner=2, gtype='doubles'),
        ]
        results = compute_rc_ratings(games, 'doubles')
        alice = next(r for r in results if r.name == 'Alice')
        bob = next(r for r in results if r.name == 'Bob')
        assert alice.rating < 1400  # lost the doubles game
        assert bob.rating > 1400

    def test_empty_games_returns_empty(self):
        assert compute_rc_ratings([], 'singles') == []

    def test_uncertainty_decreases_with_more_games(self):
        games_few = [make_game('g1', ['A'], ['B'], winner=1)]
        games_many = [
            make_game(f'g{i}', ['A'], ['B'], winner=(1 if i % 2 == 0 else 2), date=f'2026-01-{i+1:02d}')
            for i in range(8)
        ]
        few_result = compute_rc_ratings(games_few, 'singles')
        many_result = compute_rc_ratings(games_many, 'singles')
        a_few = next(r for r in few_result if r.name == 'A')
        a_many = next(r for r in many_result if r.name == 'A')
        assert a_many.uncertainty < a_few.uncertainty

    def test_period_batching_same_date(self):
        """Two games on same date should use pre-period ratings for both."""
        games = [
            make_game('g1', ['A'], ['B'], winner=1, date='2026-01-01', created_at=0),
            make_game('g2', ['A'], ['C'], winner=1, date='2026-01-01', created_at=1),
        ]
        results = compute_rc_ratings(games, 'singles')
        a = next(r for r in results if r.name == 'A')
        assert a.won == 2

    def test_doubles_teams(self):
        games = [make_game('g1', ['A', 'B'], ['C', 'D'], winner=1, gtype='doubles')]
        results = compute_rc_ratings(games, 'doubles')
        assert len(results) == 4
        winners = {r.name for r in results if r.rating > 1400}
        losers = {r.name for r in results if r.rating < 1400}
        assert winners == {'A', 'B'}
        assert losers == {'C', 'D'}


# ---------------------------------------------------------------------------
# Glicko-2
# ---------------------------------------------------------------------------

class TestGlicko2Ratings:
    def test_winner_gains_rating(self):
        games = [make_game('g1', ['Alice'], ['Bob'], winner=1)]
        results = compute_glicko2_ratings(games, 'singles')
        alice = next(r for r in results if r.name == 'Alice')
        bob = next(r for r in results if r.name == 'Bob')
        assert alice.rating > 1500
        assert bob.rating < 1500

    def test_consistently_stronger_player_ranks_first(self):
        games = [
            make_game(f'g{i}', ['Strong'], ['Weak'], winner=1, date=f'2026-01-{i+1:02d}')
            for i in range(5)
        ]
        results = compute_glicko2_ratings(games, 'singles')
        assert results[0].name == 'Strong'

    def test_win_loss_counts(self):
        games = [make_game('g1', ['Alice'], ['Bob'], winner=2)]
        results = compute_glicko2_ratings(games, 'singles')
        alice = next(r for r in results if r.name == 'Alice')
        assert alice.won == 0 and alice.lost == 1

    def test_empty_games_returns_empty(self):
        assert compute_glicko2_ratings([], 'singles') == []

    def test_volatility_field_present(self):
        games = [make_game('g1', ['A'], ['B'], winner=1)]
        results = compute_glicko2_ratings(games, 'singles')
        a = next(r for r in results if r.name == 'A')
        assert a.volatility is not None
        assert 0 < a.volatility < 1
