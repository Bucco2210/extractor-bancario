// Setea variables de entorno mínimas para que app/lib/env no falle al cargar.
process.env.MONGODB_URI ??= "mongodb://localhost:27017";
process.env.MONGODB_DB_NAME ??= "ethos_test";
process.env.AUTH_SECRET ??= "test-secret-suficientemente-largo-1234567890";
process.env.APP_ENCRYPTION_KEY ??=
  "0000000000000000000000000000000000000000000000000000000000000000";
process.env.APP_ENV ??= "test";
process.env.LOG_LEVEL ??= "silent";
