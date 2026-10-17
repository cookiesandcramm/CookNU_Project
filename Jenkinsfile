pipeline {
    agent any

   environment {
    TAG = "${BUILD_NUMBER}"
    COMPOSE_FILE = "docker-compose.yml"

    POSTGRES_DB = 'cooknu_db'
    POSTGRES_USER = 'cooknu_user'
    POSTGRES_PASSWORD = credentials('cooknu-postgres-password')
}

    triggers {
        // Poll Git every 2 minutes as a fallback if a webhook is not available.
        pollSCM('H/2 * * * *')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Test') {
            steps {
                // Basic checks for the split frontend files.
                sh '''
                    test -s frontend/index.html
                    test -s frontend/app.css
                    test -s frontend/app.js
                    test -s frontend/ui.js
                    grep -q 'app.css' frontend/index.html
                    grep -q 'app.js' frontend/index.html
                '''
            }
        }

        
stage('Build Images') { 
    steps { 
        sh ''' 
            set -eu 
            sed "s/BUILD_NUMBER/${BUILD_NUMBER}/g" frontend/index.html > frontend/index.html.tmp 
            mv frontend/index.html.tmp frontend/index.html 
            TAG=$TAG docker compose -f "$COMPOSE_FILE" build 
        ''' 
    } 
} 

stage('Deploy') {
    steps {
        sh 'TAG=$TAG docker compose -p cooknu_project -f "$COMPOSE_FILE" up -d --remove-orphans'
    }
}


        stage('Smoke Test') {
            steps {
                sh '''
                    set -eu
                    for attempt in $(seq 1 15); do
                      if curl --fail --silent http://host.docker.internal:8080/ > /dev/null; then
                        echo "Frontend is responding through the reverse proxy."
                        exit 0
                      fi
                      sleep 2
                    done
                    echo "Smoke test failed: proxy did not respond."
                    exit 1
                '''
            }
        }
    }

    post {
        success {
            echo "Cook'N U deployment succeeded. Image tag: ${TAG}"
        }
        failure {
            echo "Pipeline failed. Check the stage logs; deployment may need recovery."
        }
        always {
            echo "Jenkins build ${BUILD_NUMBER} finished with status: ${currentBuild.currentResult}"
        }
    }
}
