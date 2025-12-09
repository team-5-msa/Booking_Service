const axios = require("axios");

const baseURL =
  process.env.NODE_ENV === "production"
    ? "https://msa-payments.fly.dev" // 배포 서버 URL
    : "http://localhost:3002"; // 로컬 개발 환경 URL

const paymentAxiosInstance = axios.create({
  baseURL: "http://localhost:3002", // local과 자동으로 맞바꿀수 있는 기술력이 생기면 수정하기 꼭
  timeout: 10000, // 요청 제한 시간 (밀리초)
  headers: {
    "Content-Type": "application/json", // 요청 데이터의 타입을 JSON으로 설정
  },
});

// 요청 인터셉터 (필요시)
paymentAxiosInstance.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => Promise.reject(error)
);

// 응답 인터셉터 (필요시)
paymentAxiosInstance.interceptors.response.use(
  (response) => response.data, // 데이터만 반환
  (error) => {
    console.error("[Axios Error]", error.response || error.message);
    return Promise.reject(error);
  }
);

module.exports = paymentAxiosInstance;
