FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm i -g serve@14
EXPOSE 3000
CMD ["sh","-c","serve -s . -l ${PORT:-3000}"]
