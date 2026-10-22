const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gongshi', {
  /** 读取本地配置：{ nasUrl, updatedAt, lastError } */
  getConfig: () => ipcRenderer.invoke('config:get'),
  /** 测试某个 NAS 地址是否可达 */
  test: (url) => ipcRenderer.invoke('config:test', url),
  /** 测试通过后才写入配置并跳转 */
  connect: (url) => ipcRenderer.invoke('config:connect', url),
  /** 清除已保存的地址，回到首次配置页 */
  forget: () => ipcRenderer.invoke('config:forget'),
  /** 客户端版本号 */
  version: () => ipcRenderer.invoke('app:version')
});
