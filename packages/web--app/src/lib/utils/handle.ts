export const getOrCreateDeviceId = (): string => {
  let deviceId = localStorage.getItem('secmes_device_id');
  if (!deviceId) {
    deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('secmes_device_id', deviceId);
  }
  return deviceId;
}; 