// Канал сборки: основное приложение (prod) или тестовое (staging).
// Оба сайта на одном домене github.io, поэтому у теста свои ключи хранилища и своя база —
// он не трогает настройки, закладки и модули основного приложения.
export const CHANNEL = typeof __CHANNEL__ !== 'undefined' ? __CHANNEL__ : 'prod';
export const IS_STAGING = CHANNEL === 'staging';
export const P = IS_STAGING ? 'aobs.' : 'aob.'; // префикс ключей localStorage (у основного — прежний)
export const DB_NAME = IS_STAGING ? 'ao-bible-staging' : 'ao-bible';
