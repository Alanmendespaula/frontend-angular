#docker build -t angular . #
#docker run -d -p 8080:80 --name container-angular estudo-angular#
#docker compose up --build, para atualizar mudanças,#


docker: 
	docker start angular

dockercompose:
docker-compose up -d --build
