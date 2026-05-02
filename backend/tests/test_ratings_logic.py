"""Tests for rating helper functions in ratings.py."""
import sys
import os
import math

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.routers.ratings import _game_winner, _match_winner, _normalize_tournament, _sanitize
from app.models.tournament import Game


# ---------------------------------------------------------------------------
# _sanitize
# ---------------------------------------------------------------------------

class TestSanitize:
    def test_removes_special_chars(self):
        assert _sanitize('a.b#c$d[e]f/g') == 'a_b_c_d_e_f_g'

    def test_plain_name_unchanged(self):
        assert _sanitize('Alice Smith') == 'Alice Smith'


# ---------------------------------------------------------------------------
# _game_winner
# ---------------------------------------------------------------------------

class TestGameWinner:
    def test_team1_wins_11_5(self):
        assert _game_winner(11, 5) == 1

    def test_team2_wins_11_5(self):
        assert _game_winner(5, 11) == 2

    def test_deuce_team1(self):
        assert _game_winner(12, 10) == 1

    def test_deuce_team2(self):
        assert _game_winner(10, 12) == 2

    def test_11_10_not_enough_lead(self):
        assert _game_winner(11, 10) is None

    def test_low_score_incomplete(self):
        assert _game_winner(9, 7) is None

    def test_0_0(self):
        assert _game_winner(0, 0) is None


# ---------------------------------------------------------------------------
# _match_winner
# ---------------------------------------------------------------------------

class TestMatchWinner:
    def _g(self, s1, s2):
        return Game(team1Score=s1, team2Score=s2)

    def test_best_of_3_team1_wins_2_0(self):
        games = [self._g(11, 5), self._g(11, 7)]
        assert _match_winner(games, 3) == 1

    def test_best_of_3_team2_wins_2_0(self):
        games = [self._g(5, 11), self._g(7, 11)]
        assert _match_winner(games, 3) == 2

    def test_best_of_3_team1_wins_2_1(self):
        games = [self._g(11, 5), self._g(5, 11), self._g(11, 8)]
        assert _match_winner(games, 3) == 1

    def test_best_of_5_needs_3_wins(self):
        games = [self._g(11, 5), self._g(11, 5)]
        assert _match_winner(games, 5) is None  # only 2 wins, need 3

    def test_best_of_5_team1_wins_3_2(self):
        games = [self._g(11, 5), self._g(5, 11), self._g(11, 8), self._g(5, 11), self._g(11, 9)]
        assert _match_winner(games, 5) == 1

    def test_no_games(self):
        assert _match_winner([], 3) is None

    def test_games_format_2_games(self):
        games = [self._g(11, 5), self._g(11, 7)]
        assert _match_winner(games, 2) == 1

    def test_games_format_split(self):
        # set_count=2 → needed=ceil(2/2)=1; team1 has 1 win ≥ 1, so team1 "wins" first check
        games = [self._g(11, 5), self._g(5, 11)]
        assert _match_winner(games, 2) == 1


# ---------------------------------------------------------------------------
# _normalize_tournament
# ---------------------------------------------------------------------------

class TestNormalizeTournament:
    def test_passes_through_levels_format(self):
        data = {
            'name': 'T', 'createdAt': 0, 'format': 'games',
            'levels': [{'id': 'l1', 'name': 'L1', 'groups': [
                {'id': 'g1', 'name': 'G1', 'teams': [], 'matches': []}
            ]}],
        }
        norm = _normalize_tournament(data, 't1')
        assert norm['id'] == 't1'
        assert len(norm['levels']) == 1

    def test_promotes_old_groups_to_level1(self):
        data = {
            'name': 'T', 'createdAt': 0, 'format': 'games',
            'groups': [{'id': 'g1', 'name': 'G1', 'teams': [], 'matches': []}],
        }
        norm = _normalize_tournament(data, 't1')
        assert len(norm['levels']) == 1
        assert len(norm['levels'][0]['groups']) == 1

    def test_dict_arrays_normalized(self):
        data = {
            'name': 'T', 'createdAt': 0, 'format': 'games',
            'levels': {'0': {'id': 'l1', 'name': 'L1', 'groups': {}}},
        }
        norm = _normalize_tournament(data, 't1')
        assert isinstance(norm['levels'], list)
