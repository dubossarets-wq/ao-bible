// Повторять fn раз в ms, пока приложение на экране: в фоне таймер останавливается и не будит телефон
export function visibleInterval(fn, ms) {
  let id = 0;
  const start = () => {
    if (!id && document.visibilityState === 'visible') id = setInterval(fn, ms);
  };
  const stop = () => {
    clearInterval(id);
    id = 0;
  };
  const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());
  document.addEventListener('visibilitychange', onVisibility);
  start();
  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
