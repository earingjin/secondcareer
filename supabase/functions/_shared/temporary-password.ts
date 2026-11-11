export function generateTemporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return 'Aa1!' + btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
