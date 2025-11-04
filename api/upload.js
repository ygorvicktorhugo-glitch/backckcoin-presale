// /api/upload.js (Piñata Version - English Logs)
import pinataSDK from '@pinata/sdk';
import { Formidable } from 'formidable';
import fs from 'fs';

// Helper function required for Vercel
export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 1. Get the JWT from Vercel Environment Variables
    // (Make sure you named the variable 'PINATA_JWT')
    const PINATA_JWT = process.env.PINATA_JWT;

    if (!PINATA_JWT) {
        console.error("Server Error: PINATA_JWT key not found in environment variables.");
        return res.status(500).json({ error: 'Piñata API Key not configured on server.' });
    }
    
    // Initialize the Piñata SDK with the JWT
    const pinata = new pinataSDK({ pinataJWTKey: PINATA_JWT });

    try {
        // 2. Process the file uploaded from the frontend
        const form = new Formidable();
        const [fields, files] = await form.parse(req);

        const file = files.file[0]; // Assuming the form field name is 'file'
        if (!file) {
            return res.status(400).json({ error: 'No file received.' });
        }

        // 3. Create a readable stream from the temporary file path
        const stream = fs.createReadStream(file.filepath);
        
        const options = {
            pinataMetadata: {
                name: file.originalFilename || 'Notary File (Backchain)',
            },
            pinataOptions: {
                cidVersion: 1 
            }
        };

        // 4. Send the file to Piñata
        const result = await pinata.pinFileToIPFS(stream, options);

        // 5. Return the CID and IPFS URI
        const cid = result.IpfsHash;
        const ipfsUri = `ipfs://${cid}`;
        
        console.log("Upload via Piñata successful. CID:", cid);
        return res.status(200).json({ cid: cid, ipfsUri: ipfsUri });

    } catch (error) {
        console.error("Backend upload error (Piñata):", error);
        return res.status(500).json({ error: `Internal Server Error: ${error.message}` });
    }
}