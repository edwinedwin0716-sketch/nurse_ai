// 화면(렌더러)에 노출하는 기능만 골라서 연결
'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('my', {
  state: () => ipcRenderer.invoke('state'),
  icon: (p) => ipcRenderer.invoke('icon', p),
  open: (p) => ipcRenderer.invoke('open', p),
  reveal: (p) => ipcRenderer.invoke('reveal', p),
  addPaths: (paths, active) => ipcRenderer.invoke('add-paths', paths, active),
  addUrl: (name, url, active) => ipcRenderer.invoke('add-url', name, url, active),
  pick: (kind, active) => ipcRenderer.invoke('pick', kind, active),
  update: (id, patch) => ipcRenderer.invoke('update', id, patch),
  remove: (id) => ipcRenderer.invoke('remove', id),
  addCategory: (name) => ipcRenderer.invoke('add-category', name),
  set: (patch) => ipcRenderer.invoke('set', patch),
  hide: () => ipcRenderer.invoke('hide'),
  quit: () => ipcRenderer.invoke('quit'),
  tileMenu: (item) => ipcRenderer.invoke('tile-menu', item),
  menu: (which) => ipcRenderer.invoke('menu', which),
  pathOf: (file) => webUtils.getPathForFile(file),
  onState: (fn) => ipcRenderer.on('state', (e, s) => fn(s)),
  onFocusSearch: (fn) => ipcRenderer.on('focus-search', () => fn())
});
