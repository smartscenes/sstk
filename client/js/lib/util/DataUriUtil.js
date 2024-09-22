const Constants = require('Constants');

function toBuffer(buffer) {
  return (Constants.sys.Buffer.isBuffer(buffer)) ? buffer : new Constants.sys.Buffer(buffer);
}

function toBase64(buffer) {
  return  toBuffer(buffer).toString("base64");
}

function bufferToDataURI( buffer, mediatype ) {
  let dataBase64;
  if (Array.isArray(buffer)) {
    dataBase64 = buffer.map(function(x) { return toBase64(x); }).join("");
  } else {
    dataBase64 = toBase64(buffer);
  }
  const datauri = "data:" + mediatype + ";base64," + dataBase64;
  return datauri;
}

function toDataURI(buffer, mediatype) {
  if (Constants.isBrowser) {
    // for running on the web
    const buffers = Array.isArray(buffer)? buffer : [buffer];
    const blob = new Blob(buffers, {
      type: mediatype
    });
    return URL.createObjectURL(blob);
  } else {
    // for nodejs
    const datauri = bufferToDataURI(buffer, mediatype);
    return datauri;
  }

}

module.exports = {
  toBuffer: toBuffer,
  toDataURI: toDataURI
};