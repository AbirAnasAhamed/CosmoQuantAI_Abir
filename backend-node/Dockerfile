FROM node:18-alpine

WORKDIR /app

COPY package.json ./

RUN apk add --no-cache openssl

RUN npm install

COPY . .

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 3001

CMD ["npm", "run", "dev"]
