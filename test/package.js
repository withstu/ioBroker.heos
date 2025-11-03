import path from 'path';
import { fileURLToPath } from 'url';
import { tests } from '@iobroker/testing';

// Replace __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate the package files
tests.packageFiles(path.join(__dirname, '..'));
