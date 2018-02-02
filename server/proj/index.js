// Add your projects here!

module.exports = [
  { name: 'scannet', app: require('./scannet'), mountpath: '/scans' },
  { name: 'sim', app: require('./sim'), mountpath: '/' },
  // { name: 'projectname', app: require('./projectname'), mountpath: '/' },
];