import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMatchUpdate,
  diffUpdate,
  findProviderFixture,
  isRelevantMatch,
  mapApiStatus,
  normalizeTeam,
} from './sync-live-scores.mjs';

test('normalizes Spanish and provider team names', () => {
  assert.equal(normalizeTeam('México'), 'mexico');
  assert.equal(normalizeTeam('Mexico'), 'mexico');
  assert.equal(normalizeTeam('United States'), 'estados unidos');
  assert.equal(normalizeTeam('Côte d’Ivoire'), 'costa de marfil');
});

test('maps API-Football statuses to app statuses', () => {
  assert.equal(mapApiStatus('1H'), 'jugando');
  assert.equal(mapApiStatus('HT'), 'medio_tiempo');
  assert.equal(mapApiStatus('FT'), 'finalizado');
  assert.equal(mapApiStatus('NS'), 'pendiente');
  assert.equal(mapApiStatus('XYZ'), null);
});

test('finds provider fixture by id before team matching', () => {
  const fixture = findProviderFixture(
    { apiFootballFixtureId: 777, local: 'México', visitante: 'Sudáfrica', fecha: '2026-06-11T19:00:00Z' },
    [
      { fixture: { id: 1, date: '2026-06-11T19:00:00Z' }, teams: { home: { name: 'Mexico' }, away: { name: 'South Africa' } } },
      { fixture: { id: 777, date: '2026-06-12T19:00:00Z' }, teams: { home: { name: 'Other' }, away: { name: 'Team' } } },
    ],
  );
  assert.equal(fixture.fixture.id, 777);
});

test('finds provider fixture by teams and nearby date', () => {
  const fixture = findProviderFixture(
    { local: 'Estados Unidos', visitante: 'Australia', fecha: '2026-06-19T19:00:00Z' },
    [
      { fixture: { id: 20, date: '2026-06-19T20:00:00Z' }, teams: { home: { name: 'United States' }, away: { name: 'Australia' } } },
    ],
  );
  assert.equal(fixture.fixture.id, 20);
});

test('builds live update with score and minute', () => {
  const update = buildMatchUpdate(
    { estado: 'pendiente' },
    {
      fixture: { id: 42, status: { short: '2H', elapsed: 63 } },
      goals: { home: 2, away: 1 },
    },
    new Date('2026-06-11T20:30:00Z'),
  );
  assert.equal(update.apiFootballFixtureId, 42);
  assert.equal(update.estado, 'jugando');
  assert.equal(update.minuto, 63);
  assert.equal(update.golesLocal, 2);
  assert.equal(update.golesVisitante, 1);
});

test('maps score correctly when provider home/away are swapped', () => {
  const update = buildMatchUpdate(
    { local: 'México', visitante: 'Sudáfrica', estado: 'pendiente' },
    {
      fixture: { id: 43, status: { short: '1H', elapsed: 18 } },
      teams: { home: { name: 'South Africa' }, away: { name: 'Mexico' } },
      goals: { home: 0, away: 1 },
    },
    new Date('2026-06-11T19:20:00Z'),
  );
  assert.equal(update.golesLocal, 1);
  assert.equal(update.golesVisitante, 0);
});

test('does not create noisy diffs except lastLiveSync', () => {
  const diff = diffUpdate(
    { apiFootballFixtureId: 42, providerStatus: '2H', minuto: 63, golesLocal: 2, golesVisitante: 1, estado: 'jugando' },
    { apiFootballFixtureId: 42, providerStatus: '2H', minuto: 63, golesLocal: 2, golesVisitante: 1, estado: 'jugando', lastLiveSync: new Date() },
  );
  assert.deepEqual(Object.keys(diff), ['lastLiveSync']);
});

test('marks matches relevant near kickoff or while live', () => {
  const now = new Date('2026-06-11T18:40:00Z');
  assert.equal(isRelevantMatch({ fecha: '2026-06-11T19:00:00Z', estado: 'pendiente' }, now), true);
  assert.equal(isRelevantMatch({ fecha: '2026-06-11T10:00:00Z', estado: 'pendiente' }, now), false);
  assert.equal(isRelevantMatch({ fecha: '2026-06-11T10:00:00Z', estado: 'jugando' }, now), true);
});
