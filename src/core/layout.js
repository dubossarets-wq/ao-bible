// Раскладка экрана: на телефоне (уже 900 px) внизу — панель вкладок, на планшете и компьютере — только верхняя панель.
import { useEffect, useState } from 'react';

export const PHONE_MQ = '(max-width: 899.98px)';
const query = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(PHONE_MQ) : null);
export const isPhoneLayout = () => !!query()?.matches;

export function usePhoneLayout() {
  const [on, setOn] = useState(isPhoneLayout);
  useEffect(() => {
    const mq = query();
    if (!mq) return;
    const upd = () => setOn(mq.matches);
    upd();
    mq.addEventListener?.('change', upd);
    return () => mq.removeEventListener?.('change', upd);
  }, []);
  return on;
}
