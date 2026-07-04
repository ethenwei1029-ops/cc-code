console.error('[DEBUG] 1. start');
try {
  const { profileCheckpoint } = await import('./src/utils/startupProfiler.js');
  profileCheckpoint('debug_start');
  console.error('[DEBUG] 2. after startupProfiler');
} catch(e) { console.error('[DEBUG] startupProfiler FAIL:', e.message); }

try {
  const { startMdmRawRead } = await import('./src/utils/settings/mdm/rawRead.js');
  startMdmRawRead();
  console.error('[DEBUG] 3. after mdmRawRead');
} catch(e) { console.error('[DEBUG] mdmRawRead FAIL:', e.message); }

try {
  const { startKeychainPrefetch } = await import('./src/utils/secureStorage/keychainPrefetch.js');
  startKeychainPrefetch();
  console.error('[DEBUG] 4. after keychainPrefetch');
} catch(e) { console.error('[DEBUG] keychainPrefetch FAIL:', e.message); }

try {
  const { enableConfigs } = await import('./src/utils/config.js');
  enableConfigs();
  console.error('[DEBUG] 5. after enableConfigs');
} catch(e) { console.error('[DEBUG] enableConfigs FAIL:', e.message); }

try {
  const { initSinks } = await import('./src/utils/sinks.js');
  initSinks();
  console.error('[DEBUG] 6. after initSinks');
} catch(e) { console.error('[DEBUG] initSinks FAIL:', e.message); }

try {
  console.error('[DEBUG] 7. importing main...');
  const { main: cliMain } = await import('./src/main.js');
  console.error('[DEBUG] 8. main imported, calling...');
  await cliMain();
  console.error('[DEBUG] 9. cliMain done');
} catch(e) { console.error('[DEBUG] cliMain FAIL:', e.message, '\n', e.stack); }
