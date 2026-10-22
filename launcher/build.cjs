'use strict';
// Signs Garage Home into dist/GarageHome.wgt (signing deps in tools/signing).
// Needs AUTHOR_PW and DIST_PW; certificates from CERT_DIR (default ~/SamsungCertificate/garage).

const fs = require('fs');
const os = require('os');
const path = require('path');
const signingRequire = require('module').createRequire(path.join(__dirname, '..', 'tools', 'signing', 'package.json'));

const FILES = ['config.xml', 'index.html', 'style.css', 'app.js', 'qrcode.js', 'app-icon.png', 'logo.png', 'garage-config.js'];
const CERTS = process.env.CERT_DIR || path.join(os.homedir(), 'SamsungCertificate', 'garage');
const OUT = path.join(__dirname, 'dist', 'GarageHome.wgt');

async function main() {
    const {AUTHOR_PW, DIST_PW} = process.env;
    if (!AUTHOR_PW || !DIST_PW) throw new Error('Set AUTHOR_PW and DIST_PW');
    const forge = signingRequire('node-forge');
    const JSZip = signingRequire('jszip');
    const {Signature} = signingRequire('tizen');
    const p12 = (name, pw) => forge.pkcs12.pkcs12FromAsn1(
        forge.asn1.fromDer(fs.readFileSync(path.join(CERTS, name)).toString('binary')), false, pw);

    const contents = FILES.map(name => ({uri: encodeURIComponent(name), data: fs.readFileSync(path.join(__dirname, name))}));
    const authored = await new Signature('AuthorSignature', contents).sign(p12('author.p12', AUTHOR_PW));
    const signed = await new Signature('DistributorSignature', authored).sign(p12('distributor.p12', DIST_PW));

    const zip = new JSZip();
    for (const file of signed) zip.file(decodeURIComponent(file.uri), file.data);
    fs.mkdirSync(path.dirname(OUT), {recursive: true});
    fs.writeFileSync(OUT, await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'}));
    console.log('wrote ' + OUT);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
