# Estágio 1: Build da aplicação Angular
FROM node:22-alpine AS build

WORKDIR /app

# Copia os arquivos de dependência
COPY package.json package-lock.json ./

# Instala as dependências
RUN npm ci --legacy-peer-deps

# Copia o código fonte do projeto
COPY . .

# Compila a aplicação Angular para produção
RUN npm run build -- --configuration production

# Estágio 2: Servir a aplicação com Nginx
FROM nginx:alpine

# Copia a configuração customizada do Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os arquivos estáticos gerados no build para o diretório do Nginx
COPY --from=build /app/dist/estudo_angular2/browser /usr/share/nginx/html

# Expõe a porta 80
EXPOSE 80

# Inicia o Nginx
CMD ["nginx", "-g", "daemon off;"]


