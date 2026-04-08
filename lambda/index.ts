// lambda/index.ts
import { S3Event, S3Handler } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import * as readline from 'readline';
import { Readable } from 'stream';

const s3Client = new S3Client({ region: process.env.REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: process.env.REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.TABLE_NAME || '';

interface CsvRow {
  uuid: string;
  [key: string]: string; // Additional fields from CSV
}

export const handler: S3Handler = async (event: S3Event): Promise<void> => {
  console.log('Event received:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    console.log(`Processing file: ${key} from bucket: ${bucket}`);

    try {
      await processCSVFile(bucket, key);
      console.log(`Successfully processed file: ${key}`);
    } catch (error) {
      console.error(`Error processing file ${key}:`, error);
      throw error; // Re-throw to mark Lambda execution as failed
    }
  }
};

async function processCSVFile(bucket: string, key: string): Promise<void> {
  // Get the CSV file from S3
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error('Empty response body from S3');
  }

  // Convert S3 Body to Node.js Readable stream
  const stream = response.Body as Readable;

  // Create readline interface
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity, // Treat \r\n as a single line break
  });

  let isFirstLine = true;
  let headers: string[] = [];
  const batchItems: CsvRow[] = [];
  const BATCH_SIZE = 25; // DynamoDB batch write limit

  for await (const line of rl) {
    // Skip empty lines
    if (!line.trim()) {
      continue;
    }

    // Parse CSV line (basic parsing - consider using csv-parser for complex CSVs)
    const values = parseCsvLine(line);

    if (isFirstLine) {
      // First line is headers
      headers = values;
      isFirstLine = false;
      console.log('CSV Headers:', headers);

      // Validate that uuid column exists
      if (!headers.includes('uuid')) {
        throw new Error('CSV file must contain a "uuid" column');
      }
      continue;
    }

    // Create object from headers and values
    const row: CsvRow = { uuid: '' };
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    // Validate UUID exists
    if (!row.uuid) {
      console.warn('Skipping row with empty UUID:', row);
      continue;
    }

    batchItems.push(row);

    // Write batch if we reach the limit
    if (batchItems.length >= BATCH_SIZE) {
      await writeBatchToDynamoDB(batchItems);
      batchItems.length = 0; // Clear the array
    }
  }

  // Write remaining items
  if (batchItems.length > 0) {
    await writeBatchToDynamoDB(batchItems);
  }

  console.log('CSV file processing completed');
}

async function writeBatchToDynamoDB(items: CsvRow[]): Promise<void> {
  if (items.length === 0) return;

  console.log(`Writing batch of ${items.length} items to DynamoDB`);

  // Use BatchWrite for efficiency
  const putRequests = items.map((item) => ({
    PutRequest: {
      Item: item,
    },
  }));

  try {
    const command = new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: putRequests,
      },
    });

    const response = await docClient.send(command);

    // Handle unprocessed items (due to throttling or other issues)
    if (response.UnprocessedItems && Object.keys(response.UnprocessedItems).length > 0) {
      console.warn('Some items were not processed:', response.UnprocessedItems);
      // Implement retry logic here if needed
    }

    console.log(`Successfully wrote ${items.length} items to DynamoDB`);
  } catch (error) {
    console.error('Error writing batch to DynamoDB:', error);
    throw error;
  }
}

// Basic CSV line parser - handles quoted fields
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
  result.push(current.trim());

  return result;
}
