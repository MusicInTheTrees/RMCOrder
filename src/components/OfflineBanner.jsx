export default function OfflineBanner({ offline, syncPending }) {
  if (!offline && !syncPending) return null;
  return (
    <div className={`offline-banner ${syncPending && !offline ? 'syncing' : 'offline'}`}>
      {offline ? '⚠️ Offline — changes saving locally' : '↑ Syncing changes...'}
    </div>
  );
}
