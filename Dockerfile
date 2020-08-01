FROM node:10
CMD [ "npm", "start" ]
EXPOSE 80

WORKDIR /usr/src/app

COPY ./package.json .
COPY ./npm-shrinkwrap.json .

RUN npm install

COPY . .
