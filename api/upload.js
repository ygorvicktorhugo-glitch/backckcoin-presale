// api/upload.js
import pinataSDK from '@pinata/sdk';
import { Formidable } from 'formidable';
import fs from 'fs';
import { ethers } from 'ethers'; 

export const config = {
    api: {
        bodyParser: false,
    },
};

// Função auxiliar para definir cabeçalhos CORS
const setCorsHeaders = (res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); // Ou defina seu domínio específico em produção
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );
};

export default async function handler(req, res) {
    // 1. Configurar CORS imediatamente
    setCorsHeaders(res);

    // 2. Responder imediatamente a requisições preflight (OPTIONS)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    console.log(`[${new Date().toISOString()}] Upload request received`);

    if (req.method !== 'POST') {
        console.error('❌ Method not allowed:', req.method);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const PINATA_JWT = process.env.PINATA_JWT;
    if (!PINATA_JWT) {
        console.error('❌ Vercel Error: PINATA_JWT key not found.');
        return res.status(500).json({ error: 'Piñata API Key not configured on server.' });
    }

    const pinata = new pinataSDK({ pinataJWTKey: PINATA_JWT });
    let file = null;

    try {
        const form = new Formidable({
            maxFileSize: 50 * 1024 * 1024, // 50MB
            uploadDir: '/tmp',
            keepExtensions: true,
            // Garante que, mesmo se um arquivo só for enviado, seja tratado como array (padrão v3)
            multiples: true, 
        });

        console.log('📋 Parsing form data...');
        const [fields, files] = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) {
                    console.error('❌ Formidable .parse() callback error:', err);
                    reject(new Error('Error in .parse() callback: ' + err.message));
                }
                resolve([fields, files]);
            });
        });

        // Formidable v3 retorna arrays. Verifica se existe e pega o primeiro.
        file = (files.file && Array.isArray(files.file)) ? files.file[0] : files.file;
        
        if (!file) {
            console.error('❌ No file received in request');
            return res.status(400).json({ error: 'No file received.' });
        }

        // =======================================================
        // ### 1. VERIFICAÇÃO DE ASSINATURA ###
        // =======================================================
        console.log('🔑 Verifying wallet signature...');
        
        // Formidable v3 coloca campos de texto em arrays também
        const signature = (Array.isArray(fields.signature)) ? fields.signature[0] : fields.signature;
        const address = (Array.isArray(fields.address)) ? fields.address[0] : fields.address;
        const userDescription = (Array.isArray(fields.description)) ? fields.description[0] : (fields.description || 'No description provided.');
        
        const message = "I am signing to authenticate my file for notarization on Backchain."; 

        if (!signature || !address) {
            console.error('❌ Signature or address missing from request');
            return res.status(401).json({ error: 'Unauthorized', details: 'Signature and address are required.' });
        }

        let recoveredAddress;
        try {
            // Compatibilidade Ethers v5 vs v6
            if (ethers.verifyMessage) {
                // Ethers v6
                recoveredAddress = ethers.verifyMessage(message, signature);
            } else if (ethers.utils && ethers.utils.verifyMessage) {
                // Ethers v5
                recoveredAddress = ethers.utils.verifyMessage(message, signature);
            } else {
                throw new Error("Ethers library version incompatibility: verifyMessage not found.");
            }
        } catch (e) {
            console.error('❌ Signature verification failed:', e.message);
            return res.status(401).json({ error: 'Unauthorized', details: 'Invalid signature format.' });
        }

        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            console.error(`❌ Signature mismatch. Expected: ${address}, Got: ${recoveredAddress}`);
            return res.status(401).json({ error: 'Unauthorized', details: 'Signature does not match address.' });
        }

        console.log('✅ Signature verified for address:', recoveredAddress);

        // =======================================================
        // ### 2. UPLOAD DO ARQUIVO (ETAPA 1 de 2) ###
        // =======================================================

        console.log('📖 Creating file stream from:', file.filepath);
        const stream = fs.createReadStream(file.filepath);
        
        const fileOptions = {
            pinataMetadata: {
                name: file.originalFilename || 'Notary File (Backchain)',
            },
            pinataOptions: {
                cidVersion: 1 
            }
        };

        console.log('☁️  [ETAPA 1/2] Uploading FILE to Piñata IPFS...');
        const fileResult = await pinata.pinFileToIPFS(stream, fileOptions);
        const fileHash = `ipfs://${fileResult.IpfsHash}`;
        console.log('✅ File uploaded:', fileHash);

        // =======================================================
        // ### 3. UPLOAD DOS METADADOS (ETAPA 2 de 2) ###
        // =======================================================
        
        const notarizationTimestamp = new Date().toISOString();
        const notarizerWallet = address;
        const finalDescription = `Notarized By Backcoin.Org Decentralized Notary On ${notarizationTimestamp}, Wallet ${notarizerWallet}. Description: "${userDescription}"`;
        
        const mimeType = file.mimetype || '';
        let contentField = 'image';
        
        // Lógica para determinar se exibe como imagem ou animação/vídeo no OpenSea
        if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) {
            contentField = 'animation_url';
        } else if (mimeType === 'application/pdf') {
            // PDFs muitas vezes usam external_url ou image (se houver thumbnail), 
            // mas manteremos no padrão image/external por enquanto.
            contentField = 'image'; 
        }

        // Cria o objeto JSON de metadados
        const metadata = {
            name: `Notary Certificate - ${file.originalFilename || 'File'}`,
            description: finalDescription, 
            [contentField]: fileHash, 
            external_url: fileHash, 
            attributes: [
                { trait_type: "MIME Type", value: mimeType },
                { trait_type: "Notarized By", value: notarizerWallet },
                { trait_type: "Timestamp", value: notarizationTimestamp }
            ]
        };
        
        const metadataOptions = {
            pinataMetadata: {
                name: `${file.originalFilename || 'Notary'}_Metadata.json`,
            },
            pinataOptions: {
                cidVersion: 1 
            }
        };

        console.log('☁️  [ETAPA 2/2] Uploading METADATA JSON to Piñata IPFS...');
        const metadataResult = await pinata.pinJSONToIPFS(metadata, metadataOptions);
        const metadataHash = `ipfs://${metadataResult.IpfsHash}`;
        console.log('✅ Metadata uploaded:', metadataHash);

        // =======================================================
        // ### 4. RETORNO ###
        // =======================================================

        console.log('✅ Upload successful!');
        
        return res.status(200).json({ 
            success: true,
            cid: metadataResult.IpfsHash, 
            ipfsUri: metadataHash, 
        });

    } catch (error) {
        console.error('❌ Upload Error (Main Catch):', error);
        return res.status(500).json({
            error: 'Server Error during upload.',
            details: error.message || 'Internal error processing upload.',
        });

    } finally {
        // Limpeza do arquivo temporário
        if (file && file.filepath) {
            try {
                if (fs.existsSync(file.filepath)) {
                    fs.unlinkSync(file.filepath);
                    console.log('🗑️  Temporary file deleted:', file.filepath);
                }
            } catch (e) {
                console.warn('⚠️  Could not delete temporary file:', e.message);
            }
        }
    }
}