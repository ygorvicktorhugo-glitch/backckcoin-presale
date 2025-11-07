// /api/upload.js (Versão correta para Vercel)
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
    console.log(`[${new Date().toISOString()}] Upload request received`);

    if (req.method !== 'POST') {
        console.error('❌ Method not allowed:', req.method);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 1. Get the JWT from Vercel Environment Variables
    const PINATA_JWT = process.env.PINATA_JWT;

    if (!PINATA_JWT) {
        console.error("❌ Vercel Error: PINATA_JWT key not found in environment variables.");
        return res.status(500).json({ 
            error: 'Piñata API Key not configured on server (Vercel ENV).',
            hint: 'Configure PINATA_JWT in Vercel Dashboard → Settings → Environment Variables'
        });
    }
    
    console.log('✅ PINATA_JWT found in environment');
    const pinata = new pinataSDK({ pinataJWTKey: PINATA_JWT });
    let file = null; // Definido fora do try para uso no finally

    try {
        // 2. Process the file uploaded from the frontend
        
        // =================================================================
        // ### A CORREÇÃO CRÍTICA ###
        // Usamos a sintaxe do seu 'upload que funcionava.js'
        // e adicionamos o 'uploadDir' para a Vercel.
        const form = new Formidable({
             maxFileSize: 50 * 1024 * 1024, // 50MB limite
             uploadDir: '/tmp',             // Informa ao Formidable para usar o /tmp da Vercel
             keepExtensions: true,          // Mantém a extensão (ex: .jpg, .pdf)
        });
        // =================================================================
        
        console.log('📋 Parsing form data...');
        const [fields, files] = await form.parse(req); //

        file = files.file ? files.file[0] : null; //
        
        if (!file) {
            console.error('❌ No file received in request');
            return res.status(400).json({ error: 'No file received.' });
        }

        console.log('📄 File details:', {
            originalName: file.originalFilename,
            size: file.size,
            mimetype: file.mimetype,
            filepath: file.filepath // Este caminho agora será /tmp/nome-aleatorio.ext
        });

        // 3. Create a readable stream from the temporary file path
        console.log('📖 Creating file stream from:', file.filepath);
        const stream = fs.createReadStream(file.filepath); //
        
        const options = {
            pinataMetadata: {
                name: file.originalFilename || 'Notary File (Backchain)', //
            },
            pinataOptions: {
                cidVersion: 1 //
            }
        };

        // 4. Send the file to Piñata
        console.log('☁️  Uploading to Piñata IPFS...');
        const result = await pinata.pinFileToIPFS(stream, options); //

        // 5. Return the CID and IPFS URI
        const cid = result.IpfsHash; //
        const ipfsUri = `ipfs://${cid}`; //
        
        console.log('✅ Vercel Upload successful!');
        console.log('CID:', cid);
        console.log('IPFS URI:', ipfsUri);
        
        return res.status(200).json({ 
            success: true,
            cid: cid, 
            ipfsUri: ipfsUri,
            fileName: file.originalFilename,
            fileSize: file.size,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Vercel/Piñata Upload Error:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        
        return res.status(500).json({
            error: 'Vercel Internal Server Error during upload.',
            details: error.message || 'Internal error processing Piñata upload.',
            errorType: error.name || 'UnknownError'
        });
        
    } finally {
        // Limpa o arquivo temporário (melhor prática Serverless)
        if (file && file.filepath) {
            try {
                fs.unlinkSync(file.filepath);
                console.log('🗑️  Temporary file deleted:', file.filepath);
            } catch (e) {
                console.warn('⚠️  Could not delete temporary file:', e.message);
            }
        }
    }
}