import Database from 'better-sqlite3';

console.log('Testing pos tab logic...');
let tabs = [
  { id: 1, title: 'فاتورة 1', items: [{ name: 'Augmentin' }] }
];
let activeTabId = 1;
let nextTabNumber = 2;

function handleAddNewTab() {
  const newTabId = Date.now();
  const newTab = {
    id: newTabId,
    title: `فاتورة ${nextTabNumber}`,
    items: []
  };
  tabs = [...tabs, newTab];
  activeTabId = newTabId;
  nextTabNumber++;
}

handleAddNewTab();
console.log('Active tab id:', activeTabId);
console.log('Tabs:', tabs.map(t => ({ id: t.id, title: t.title, isActive: t.id === activeTabId })));
