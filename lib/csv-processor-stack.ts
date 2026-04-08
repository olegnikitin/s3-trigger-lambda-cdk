// lib/csv-processor-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

export class CsvProcessorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create DynamoDB Table
    const table = new dynamodb.Table(this, 'CsvDataTable', {
      tableName: 'csv-data-table',
      partitionKey: {
        name: 'uuid',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for production
      pointInTimeRecovery: true,
    });

    // Create S3 Bucket
    const bucket = new s3.Bucket(this, 'CsvUploadBucket', {
      bucketName: `csv-upload-bucket-${this.account}-${this.region}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for production
      autoDeleteObjects: true, // Remove for production
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // Create Lambda Function
    const csvProcessorLambda = new lambda.Function(this, 'CsvProcessorLambda', {
      functionName: 'csv-processor-lambda',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        TABLE_NAME: table.tableName,
        REGION: this.region,
      },
      logRetention: 7, // CloudWatch Logs retention in days
    });

    // Grant Lambda permissions to read from S3
    bucket.grantRead(csvProcessorLambda);

    // Grant Lambda permissions to write to DynamoDB
    table.grantWriteData(csvProcessorLambda);

    // Add S3 trigger for Lambda
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(csvProcessorLambda),
      {
        suffix: '.csv', // Only trigger on CSV files
      }
    );

    // Outputs
    new cdk.CfnOutput(this, 'BucketName', {
      value: bucket.bucketName,
      description: 'S3 Bucket Name',
      exportName: 'CsvUploadBucketName',
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: table.tableName,
      description: 'DynamoDB Table Name',
      exportName: 'CsvDataTableName',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: csvProcessorLambda.functionName,
      description: 'Lambda Function Name',
      exportName: 'CsvProcessorLambdaName',
    });
  }
}
