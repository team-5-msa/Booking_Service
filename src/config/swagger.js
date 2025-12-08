const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Booking Service API",
      version: "1.0.0",
      description: "Booking Service API 문서",
    },
    servers: [
      {
        url: "http://localhost:4000",
      },
    ],
  },
  // API 주석이 있는 파일들의 경로
  apis: [
    "./src/routes/*.js",
    "./src/modules/**/*.js",
    "./src/routes/*.swagger.js", // 별도로 분리한 swagger 주석 파일 포함
  ],
};

const specs = swaggerJsdoc(options);

module.exports = specs;
