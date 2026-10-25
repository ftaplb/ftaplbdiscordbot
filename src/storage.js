import path from 'node:path';

export function storageInfo(env = process.env, cwd = process.cwd()) {
  const directory = path.resolve(cwd, env.DATA_DIR || env.RAILWAY_VOLUME_MOUNT_PATH || 'data');
  const mount = env.RAILWAY_VOLUME_MOUNT_PATH && path.resolve(cwd, env.RAILWAY_VOLUME_MOUNT_PATH);
  const relative = mount ? path.relative(mount, directory) : null;
  const persistent = Boolean(mount && (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))));
  const warning = env.RAILWAY_ENVIRONMENT_ID && !persistent
    ? 'Redeploy persistence is NOT configured. Attach a Railway volume at /data and remove DATA_DIR or point it inside that volume. Download a backup before redeploying.' : null;
  return { directory, persistent, warning, status: persistent ? 'Railway volume detected; settings survive redeploys.'
    : warning || 'Local disk storage; redeploy persistence depends on your host retaining this directory.' };
}
