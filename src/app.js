const express = require('express');
const path = require('path');
const YAML = require('yamljs');
const swaggerUi = require('swagger-ui-express');
const { notFound } = require('./middleware/notFound');
const { errorHandler } = require('./middleware/errorHandler');
const authRoutes = require('./modules/auth/auth.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const roomsRoutes = require('./modules/rooms/rooms.routes');
const billingRoutes = require('./modules/billing/billing.routes');
const childrenRoutes = require('./modules/children/children.routes');
const absencesRoutes = require('./modules/absences/absences.routes');
const parentsRoutes = require('./modules/parents/parents.routes');
const staffRoutes = require('./modules/staff/staff.routes');
const groupsRoutes = require('./modules/groups/groups.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const clubsRoutes = require('./modules/clubs/clubs.routes');
const scheduleRoutes = require('./modules/schedule/schedule.routes');

const swaggerDocument = YAML.load(path.join(__dirname, '../docs/openapi.yaml'));

function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/settings', settingsRoutes);
  app.use('/api/v1/rooms', roomsRoutes);
  app.use('/api/v1/billing', billingRoutes);
  app.use('/api/v1/children/:childId/absences', absencesRoutes);
  app.use('/api/v1/children', childrenRoutes);
  app.use('/api/v1/parents', parentsRoutes);
  app.use('/api/v1/staff', staffRoutes);
  app.use('/api/v1/groups', groupsRoutes);
  app.use('/api/v1/analytics', analyticsRoutes);
  app.use('/api/v1/schedule', scheduleRoutes);
  app.use('/api/v1/clubs', clubsRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
