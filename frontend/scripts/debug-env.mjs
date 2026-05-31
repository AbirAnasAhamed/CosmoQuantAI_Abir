import { loadEnv } from 'vite';

const env = loadEnv('development', process.cwd(), '');

console.log('------ DEBUG START ------');
console.log('VITE_BACKEND_URL from loadEnv:', env.VITE_BACKEND_URL);
console.log('VITE_BACKEND_URL from process.env:', process.env.VITE_BACKEND_URL);
console.log('------ DEBUG END ------');
