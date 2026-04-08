// bin/app.ts
// #!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CsvProcessorStack } from '../lib/csv-processor-stack';

const app = new cdk.App();

new CsvProcessorStack(app, 'CsvProcessorStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Stack for processing CSV files from S3 and storing in DynamoDB',
});

app.synth();
