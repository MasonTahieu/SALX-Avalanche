const assert = require('assert');
const { S3Client } = require('@aws-sdk/client-s3');

process.env.IPFS_PROVIDER = 'filebase';
process.env.FILEBASE_ACCESS_KEY = 'test-key';
process.env.FILEBASE_SECRET_KEY = 'test-secret';
process.env.FILEBASE_BUCKET = 'salx-test';
delete process.env.IPFS_GATEWAY_URL;

// Giả lập Filebase: PutObject lưu object, HeadObject trả CID trong metadata.
const sent = [];
S3Client.prototype.send = async function send(command) {
  const name = command.constructor.name;
  sent.push({ name, input: command.input });
  if (name === 'PutObjectCommand') return {};
  if (name === 'HeadObjectCommand') return { Metadata: { cid: 'bafkreitestcid' } };
  throw new Error(`Unexpected command ${name}`);
};

const { pinJSONToIPFS, pinBufferToIPFS, ipfsToHttp, getProvider } = require('../services/ipfsService');

const run = async () => {
  assert.equal(getProvider(), 'filebase');

  const json = await pinJSONToIPFS({ hello: 'world' }, 'project metadata.json');
  assert.equal(json.cid, 'bafkreitestcid');
  assert.equal(json.uri, 'ipfs://bafkreitestcid');
  assert.ok(json.timestamp);

  const put = sent[0];
  assert.equal(put.name, 'PutObjectCommand');
  assert.equal(put.input.Bucket, 'salx-test');
  assert.equal(put.input.ContentType, 'application/json');
  assert.equal(put.input.Body, JSON.stringify({ hello: 'world' }));
  assert.match(put.input.Key, /^\d+-[0-9a-f]{8}-project_metadata\.json$/);
  assert.equal(sent[1].name, 'HeadObjectCommand');
  assert.equal(sent[1].input.Key, put.input.Key);

  const file = await pinBufferToIPFS({ buffer: Buffer.from('pdf'), filename: 'mrv.pdf', contentType: 'application/pdf' });
  assert.equal(file.uri, 'ipfs://bafkreitestcid');
  assert.equal(sent[2].input.ContentType, 'application/pdf');

  assert.equal(ipfsToHttp('ipfs://bafkreitestcid'), 'https://ipfs.filebase.io/ipfs/bafkreitestcid');

  S3Client.prototype.send = async (command) => (command.constructor.name === 'HeadObjectCommand' ? { Metadata: {} } : {});
  await assert.rejects(() => pinJSONToIPFS({}), /không trả về CID/);

  console.log('✅ Filebase IPFS provider test passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
