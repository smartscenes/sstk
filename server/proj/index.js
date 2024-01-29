// Add your projects here!

module.exports = [
  { name: 'articulations', app: require('./articulations'), mountpath: '/' },
  { name: 'scannet', app: require('./scannet'), mountpath: '/scans' },
  { name: 'multiscan', app: require('./multiscan'), mountpath: '/' },
  { name: 'sim', app: require('./sim'), mountpath: '/' },
  { name: 'rlsd', app: require('./rlsd'), mountpath: '/' },
  { name: 'rlsd-scene-manager-client', app: require('./rlsd-scene-manager-client'), mountpath: '/scene-manager' }
  // { name: 'projectname', app: require('./projectname'), mountpath: '/' },
];