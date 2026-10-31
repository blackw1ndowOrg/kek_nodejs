const express = require('express');
const { notFound } = require('./middleware/notFound');
const { errorHandler } = require('./middleware/errorHandler');
const authRoutes = require('./modules/auth/auth.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const roomsRoutes = require('./modules/rooms/rooms.routes');
const billingRoutes = require('./modules/billing/billing.routes');
const childrenRoutes = require('./modules/children/children.routes');
const parentsRoutes = require('./modules/parents/parents.routes');
const staffRoutes = require('./modules/staff/staff.routes');
const groupsRoutes = require('./modules/groups/groups.routes');
const clubsRoutes = require('./modules/clubs/clubs.routes');

function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/settings', settingsRoutes);
  app.use('/api/v1/rooms', roomsRoutes);
  app.use('/api/v1/billing', billingRoutes);
  app.use('/api/v1/children', childrenRoutes);
  app.use('/api/v1/parents', parentsRoutes);
  app.use('/api/v1/staff', staffRoutes);
  app.use('/api/v1/groups', groupsRoutes);
  app.use('/api/v1/schedule', require('./modules/schedule/schedule.routes'));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
