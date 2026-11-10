const express = require('express');
const { requireAuth } = require('../middleware/auth');

/** Builds the /api router. Handlers are thin: parse -> call service -> shape JSON. */
function createApiRouter(services) {
  const router = express.Router();
  const auth = requireAuth(services.auth);

  router.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

  // ---- Auth ---------------------------------------------------------------
  router.post('/auth/register', async (req, res) => {
    res.status(201).json(await services.auth.register(req.body));
  });
  router.post('/auth/login', async (req, res) => {
    res.json(await services.auth.login(req.body));
  });
  router.get('/auth/me', auth, async (req, res) => {
    res.json({ user: await services.auth.me(req.user.id) });
  });

  // ---- Bounties -----------------------------------------------------------
  router.get('/bounties', auth, async (req, res) => {
    res.json({ bounties: await services.bounties.listOpen(req.user.id) });
  });
  router.get('/bounties/mine', auth, async (req, res) => {
    res.json({ bounties: await services.bounties.listMine(req.user.id) });
  });
  router.post('/bounties', auth, async (req, res) => {
    res.status(201).json({ bounty: await services.bounties.createBounty(req.user.id, req.body) });
  });
  router.get('/bounties/:id', auth, async (req, res) => {
    res.json({ bounty: await services.bounties.getBounty(req.user.id, req.params.id) });
  });
  router.post('/bounties/:id/accept', auth, async (req, res) => {
    res.json(await services.bounties.acceptBounty(req.user.id, req.params.id));
  });
  router.post('/bounties/:id/complete', auth, async (req, res) => {
    res.json({ bounty: await services.bounties.completeBounty(req.user.id, req.params.id) });
  });
  router.post('/bounties/:id/cancel', auth, async (req, res) => {
    res.json({ bounty: await services.bounties.cancelBounty(req.user.id, req.params.id) });
  });

  // ---- Rooms --------------------------------------------------------------
  router.get('/rooms/:id', auth, async (req, res) => {
    res.json({ room: await services.rooms.getRoom(req.user.id, req.params.id) });
  });
  router.post('/rooms/:id/messages', auth, async (req, res) => {
    res.status(201).json({ message: await services.rooms.postMessage(req.user.id, req.params.id, req.body?.text) });
  });
  router.put('/rooms/:id/notes', auth, async (req, res) => {
    res.json({ room: await services.rooms.updateNotes(req.user.id, req.params.id, req.body?.notes) });
  });

  return router;
}

module.exports = { createApiRouter };
