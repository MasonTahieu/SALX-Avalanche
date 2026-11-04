const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const PINATA_JSON_ENDPOINT = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
const PINATA_FILE_ENDPOINT = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

// IPFS_PROVIDER = 'filebase' | 'pinata'. Bỏ trống: dùng Filebase nếu đã có FILEBASE_ACCESS_KEY.
const getProvider = () =>
  (process.env.IPFS_PROVIDER || (process.env.FILEBASE_ACCESS_KEY ? 'filebase' : 'pinata'))
    .trim()
    .toLowerCase();

const DEFAULT_GATEWAYS = {
  filebase: 'https://ipfs.filebase.io/ipfs',
  pinata: 'https://gateway.pinata.cloud/ipfs',
};

let filebaseClient = null;

const getFilebase = () => {
  const { FILEBASE_ACCESS_KEY, FILEBASE_SECRET_KEY, FILEBASE_BUCKET } = process.env;
  if (!FILEBASE_ACCESS_KEY || !FILEBASE_SECRET_KEY || !FILEBASE_BUCKET) {
    throw new Error('Thiếu FILEBASE_ACCESS_KEY, FILEBASE_SECRET_KEY hoặc FILEBASE_BUCKET');
  }

  if (!filebaseClient) {
    filebaseClient = new S3Client({
      endpoint: process.env.FILEBASE_S3_ENDPOINT || 'https://s3.filebase.com',
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: FILEBASE_ACCESS_KEY,
        secretAccessKey: FILEBASE_SECRET_KEY,
      },
    });
  }

  return { client: filebaseClient, bucket: FILEBASE_BUCKET };
};

// Bucket IPFS của Filebase tự pin mọi object được upload và trả CID qua metadata "cid".
const filebaseUpload = async ({ body, filename, contentType }) => {
  const { client, bucket } = getFilebase();
  const safeName = String(filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const key = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`;

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType || 'application/octet-stream',
  }));

  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const cid = head.Metadata?.cid;
  if (!cid) {
    throw new Error(`Filebase không trả về CID cho ${key}. Kiểm tra bucket đã chọn mạng IPFS chưa.`);
  }

  return {
    cid,
    uri: `ipfs://${cid}`,
    timestamp: new Date().toISOString(),
  };
};

const getPinataHeaders = () => {
  if (process.env.PINATA_JWT) {
    return { Authorization: `Bearer ${process.env.PINATA_JWT}` };
  }

  if (!process.env.PINATA_API_KEY || !process.env.PINATA_SECRET_API_KEY) {
    throw new Error('Thiếu PINATA_JWT hoặc PINATA_API_KEY/PINATA_SECRET_API_KEY');
  }

  return {
    pinata_api_key: process.env.PINATA_API_KEY,
    pinata_secret_api_key: process.env.PINATA_SECRET_API_KEY,
  };
};

const normalizeIpfsUri = (value) => {
  if (!value) return null;
  if (value.startsWith('ipfs://')) return value;
  if (/^[a-zA-Z0-9]+$/.test(value)) return `ipfs://${value}`;
  return value;
};

const extractIpfsCid = (uri) => {
  if (!uri) return null;
  if (uri.startsWith('ipfs://')) {
    return uri.slice('ipfs://'.length).split('/')[0];
  }
  const marker = '/ipfs/';
  const index = uri.indexOf(marker);
  if (index >= 0) return uri.slice(index + marker.length).split('/')[0];
  return null;
};

const ipfsToHttp = (uri) => {
  if (!uri) return null;
  if (!uri.startsWith('ipfs://')) return uri;

  const gateway = (process.env.IPFS_GATEWAY_URL || DEFAULT_GATEWAYS[getProvider()] || DEFAULT_GATEWAYS.pinata)
    .replace(/\/$/, '');
  const path = uri.slice('ipfs://'.length);
  return `${gateway}/${path}`;
};

const pinJSONToIPFS = async (content, name = 'carbox-metadata.json') => {
  if (getProvider() === 'filebase') {
    return filebaseUpload({
      body: JSON.stringify(content),
      filename: name,
      contentType: 'application/json',
    });
  }

  const response = await axios.post(
    PINATA_JSON_ENDPOINT,
    {
      pinataContent: content,
      pinataMetadata: { name },
      pinataOptions: { cidVersion: 1 },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        ...getPinataHeaders(),
      },
      timeout: 30000,
    }
  );

  return {
    cid: response.data.IpfsHash,
    uri: `ipfs://${response.data.IpfsHash}`,
    timestamp: response.data.Timestamp,
  };
};

const pinBufferToIPFS = async ({ buffer, filename, contentType }) => {
  if (getProvider() === 'filebase') {
    return filebaseUpload({ body: buffer, filename, contentType });
  }

  const formData = new FormData();
  formData.append('file', buffer, { filename, contentType });
  formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
  formData.append('pinataMetadata', JSON.stringify({ name: filename }));

  const response = await axios.post(PINATA_FILE_ENDPOINT, formData, {
    headers: {
      ...formData.getHeaders(),
      ...getPinataHeaders(),
    },
    maxBodyLength: Infinity,
    timeout: 30000,
  });

  return {
    cid: response.data.IpfsHash,
    uri: `ipfs://${response.data.IpfsHash}`,
    timestamp: response.data.Timestamp,
  };
};

const fetchJSONFromURI = async (uri) => {
  if (!uri) return null;

  try {
    const response = await axios.get(ipfsToHttp(uri), {
      timeout: 15000,
      headers: { Accept: 'application/json' },
    });

    if (response.data && typeof response.data === 'object') {
      return response.data;
    }
    return null;
  } catch (error) {
    console.warn(`⚠️ Không thể tải metadata từ ${uri}: ${error.message}`);
    return null;
  }
};

module.exports = {
  getProvider,
  extractIpfsCid,
  fetchJSONFromURI,
  ipfsToHttp,
  normalizeIpfsUri,
  pinBufferToIPFS,
  pinJSONToIPFS,
};
