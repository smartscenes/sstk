// Add your projects here!

module.exports = [
  { name: 'scannet', app: require('./scannet'), mountpath: '/scans' },
  { name: 'shapenet', app: require('./shapenet'), mountpath: '/' },
  { name: 'sim', app: require('./sim'), mountpath: '/' },
  // { name: 'projectname', app: require('./projectname'), mountpath: '/' },
];