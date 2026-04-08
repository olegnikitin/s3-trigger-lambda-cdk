# 1. Initialize the project
mkdir csv-processor-cdk && cd csv-processor-cdk
npm init -y

# 2. Install root dependencies
npm install aws-cdk-lib constructs
npm install --save-dev aws-cdk typescript @types/node source-map-support

# 3. Create directory structure
mkdir -p bin lib lambda

# 4. Copy all the files above to their respective locations

# 5. Install Lambda dependencies
cd lambda
npm install

# 6. Build everything
cd ..
npm run build

# 7. Bootstrap CDK (first time only)
npx cdk bootstrap

# 8. Deploy the stack
npm run deploy

# 9. Test by uploading a CSV file
# Create a test CSV file
cat > test.csv << EOF
uuid,name,email,age
123e4567-e89b-12d3-a456-426614174000,John Doe,john@example.com,30
223e4567-e89b-12d3-a456-426614174001,Jane Smith,jane@example.com,25
EOF

# Upload to S3 (replace BUCKET_NAME with the output from CDK)
aws s3 cp test.csv s3://BUCKET_NAME/test.csv
