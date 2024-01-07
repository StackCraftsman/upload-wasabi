import express from 'express';
import { config } from 'dotenv';
import multer from 'multer';
import { S3, PutObjectCommand } from '@aws-sdk/client-s3';

config();

const app = express();
const PORT = process.env.PORT || 3000;

const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 5 }, // 5 MB limit
  fileFilter,
});

// Middleware for handling errors
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    res.status(400).send(`Error uploading files: ${error.message}`);
  } else if (error) {
    res.status(400).send(`Error: ${error.message}`);
  } else {
    next();
  }
});

// AWS S3 configuration
const s3 = new S3({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

app.post('/upload', upload.array('files', 10), async (req, res) => {
  const files = req.files;
  let folder = req.query.folder || ''; 

  // Support nested folders
  const subfolder = req.query.sub || '';
  if (subfolder) {
    folder = folder ? `${folder}/${subfolder}` : subfolder;
  }

  if (!files || files.length === 0) {
    return res.status(400).send('No files uploaded.');
  }

  const bucketName = process.env.AWS_S3_BUCKET_NAME;

  if (!bucketName) {
    return res.status(500).send('AWS_S3_BUCKET_NAME environment variable is not set.');
  }

  console.log('Uploading to bucket:', bucketName);

  try {
    const uploadPromises = files.map(async (file) => {
      const timestamp = new Date().getTime();
      const uniqueIdentifier = `${timestamp}_${file.originalname}`;

      const key = folder ? `${folder}/${uniqueIdentifier}` : uniqueIdentifier;

      const params = {
        Bucket: bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      };
      await s3.send(new PutObjectCommand(params));
      const s3Url = `https://${bucketName}.s3.amazonaws.com/${key}`;
      console.log(`File uploaded to S3. S3 URL: ${s3Url}`);
      return s3Url;
    });

    const uploadedUrls = await Promise.all(uploadPromises);

    res.status(200).send(`Files uploaded to S3 successfully!\nS3 URLs:\n${uploadedUrls.join('\n')}`);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error uploading files to S3');
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
