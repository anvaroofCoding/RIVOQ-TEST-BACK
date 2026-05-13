/** Mobil brauzer / WebView oraliq keshlangan JSON profil-wallet ni yangilamasligi uchun */
export function setPrivateNoStore(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
}
