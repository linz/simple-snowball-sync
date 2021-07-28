import o from 'ospec';
import sinon from 'sinon';
import { BackOff, uploadFile } from '../upload';

o.spec('Upload', () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();

  o.before(() => {
    BackOff.count = 3;
    BackOff.time = 1;
  });

  o.afterEach(() => {
    sandbox.restore();
  });

  o('should be uploaded', async () => {
    const uploadCtx = {
      Bucket: 'BUCKET',
      Key: 'S3Key',
      Body: 'test',
    };
    const s3Client = {
      upload: sandbox.stub().returns({ promise: sandbox.stub().resolves }),
    };

    await uploadFile(s3Client as any, uploadCtx);
    o(s3Client.upload.callCount).equals(1);
  });

  o('should failed once and uploaded at the second time', async () => {
    const uploadCtx = {
      Bucket: 'BUCKET',
      Key: 'S3Key',
      Body: 'test',
    };
    const s3Client = {
      upload: sandbox
        .stub()
        .onFirstCall()
        .returns({ promise: sandbox.stub().rejects(new Error('upload failed')) })
        .onSecondCall()
        .returns({ promise: sandbox.stub().resolves }),
    };

    try {
      await uploadFile(s3Client as any, uploadCtx);
    } catch (e) {
      // Do nothing
    } finally {
      o(s3Client.upload.callCount).equals(2);
    }
  });

  o('should failed after 3 retries', async () => {
    const uploadCtx = {
      Bucket: 'BUCKET',
      Key: 'S3Key',
      Body: 'test',
    };
    const s3Client = {
      upload: sandbox.stub().returns({ promise: sandbox.stub().rejects(new Error('upload failed')) }),
    };

    try {
      await uploadFile(s3Client as any, uploadCtx);
    } catch (e) {
      // Do nothing
    } finally {
      o(s3Client.upload.callCount).equals(BackOff.count);
    }
  });
});
