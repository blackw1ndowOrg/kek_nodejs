const { AppError, BadRequestError, NotFoundError } = require('../../errors/AppError');
const { settingsRepository } = require('./settings.repository');
const { DEFINITIONS_BY_CONSTANT, toConstantCase } = require('./settings.definitions');

function freezeValue(value) {
  return Array.isArray(value) ? Object.freeze([...value]) : value;
}

function buildDefaultCache() {
  const cache = {};
  for (const [constantKey, definition] of Object.entries(DEFINITIONS_BY_CONSTANT)) {
    cache[constantKey] = freezeValue(definition.default);
  }
  return cache;
}

function buildDefaultDbKeys() {
  return new Map(
    Object.entries(DEFINITIONS_BY_CONSTANT).map(([constantKey, { dbKey }]) => [constantKey, dbKey])
  );
}

/**
 * Settings cache service.
 * Performs a single database query on startup; subsequent get() calls are synchronous.
 *
 * Example usage:
 *   await settingsService.load();                         // Call once on startup (e.g., server.js)
 *   const price = settingsService.get('TUITION_MONTHLY'); // Used everywhere else, no DB calls
 */
class SettingsService {
  constructor(repository = settingsRepository) {
    this.repository = repository;
    this.cache = Object.freeze(buildDefaultCache());
    this.dbKeys = buildDefaultDbKeys();
    this.loaded = true;
    this.loading = null;
  }

  /**
   * Loads settings once; repeated calls return the same result without hitting the database.
   * @returns {Promise<Object>}
   */
  async load() {
    if (!this.loading) {
      this.loading = this.refresh().catch((error) => {
        this.loading = null;
        throw error;
      });
    }
    return this.loading;
  }

  /**
   * Forcefully reloads settings from the database (e.g., if modified externally).
   * @returns {Promise<Object>}
   */
  async refresh() {
    const rows = await this.repository.findAll();
    const cache = buildDefaultCache();
    const dbKeys = buildDefaultDbKeys();
    for (const row of rows) {
      const key = toConstantCase(row.key);
      const definition = DEFINITIONS_BY_CONSTANT[key];
      if (definition && !definition.schema.safeParse(row.value).success) {
        console.warn(`[settings] Invalid value for "${row.key}" in DB — default is used`);
        continue;
      }
      cache[key] = freezeValue(row.value);
      dbKeys.set(key, row.key);
    }
    this.cache = Object.freeze(cache);
    this.dbKeys = dbKeys;
    this.loaded = true;
    return this.cache;
  }

  assertLoaded() {
    if (!this.loaded) {
      throw new AppError('Settings are not loaded yet: call settingsService.load() on startup');
    }
  }

  /**
   * Retrieves a setting by key.
   * 
   * @param {string} key e.g. 'TUITION_MONTHLY'
   * @returns {number|number[]|*}
   */
  get(key) {
    this.assertLoaded();
    const normalized = toConstantCase(key);
    if (!Object.hasOwn(this.cache, normalized)) {
      throw new NotFoundError(`Setting not found: ${key}`);
    }
    return this.cache[normalized];
  }

  getAll() {
    this.assertLoaded();
    return this.cache;
  }

  /**
   * Updates a value in the DB and immediately updates the cache.
   * New keys cannot be created — only existing ones can be updated.
   * 
   * @param {string} key
   * @param {*} value
   * @returns {Promise<{ key: string, value: * }>}
   */
  async set(key, value) {
    this.assertLoaded();
    const normalized = toConstantCase(key);
    const dbKey = this.dbKeys.get(normalized);
    if (dbKey === undefined) {
      throw new NotFoundError(`Setting not found: ${key}`);
    }

    this.assertConsistent(normalized, value);

    const row = await this.repository.upsert(dbKey, value);
    this.cache = Object.freeze({ ...this.cache, [normalized]: freezeValue(row.value) });
    return { key: normalized, value: this.cache[normalized] };
  }

  assertConsistent(key, value) {
    if (key === 'GROUP_EXTRA_PAY_THRESHOLD' && value > this.cache.MAX_CHILDREN_IN_GROUP) {
      throw new BadRequestError('Extra-pay threshold cannot exceed the max children in a group');
    }
    if (key === 'MAX_CHILDREN_IN_GROUP' && value < this.cache.GROUP_EXTRA_PAY_THRESHOLD) {
      throw new BadRequestError('Max children in a group cannot be below the extra-pay threshold');
    }
  }
}

const settingsService = new SettingsService();

module.exports = { SettingsService, settingsService, toConstantCase };