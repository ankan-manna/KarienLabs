import type { Request } from 'express';

import { sendCreated, sendPaginated, sendSuccess } from '../../utils/api-response';
import { ValidationError } from '../../utils/app-error';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import * as productService from './product.service';

export const listProductsHandler = asyncHandler(async (req, res) => {
  const result = await productService.listProducts(req.query as unknown as ListQuery);
  return sendPaginated(res, result.items, result.meta);
});

export const getProductHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await productService.getPublicProductDetail(req.params.id));
});

export const createProductHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await productService.createProduct(req.body, req.user!.id));
});

export const updateProductHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await productService.updateProduct(req.params.id, req.body, req.user!.id, req.user!.role),
  );
});

export const deleteProductHandler = asyncHandler(async (req: Request, res) => {
  await productService.deleteProduct(req.params.id, req.user!.id);
  return sendSuccess(res, { deleted: true });
});

export const bulkEditProductsHandler = asyncHandler(async (req: Request, res) => {
  const { ids, patch } = req.body;
  return sendSuccess(res, await productService.bulkEditProducts(ids, patch, req.user!.id));
});

export const bulkDeleteProductsHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await productService.bulkDeleteProducts(req.body.ids, req.user!.id));
});

export const getProductImageConfigHandler = asyncHandler(async (_req, res) => {
  return sendSuccess(res, await productService.getProductImageConfig());
});

export const setMainProductImageHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await productService.setMainProductImage(req.params.id, req.body, req.user!.id),
  );
});

export const addSubProductImageHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await productService.addSubProductImage(req.params.id, req.body, req.user!.id),
  );
});

export const removeSubProductImageHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await productService.removeSubProductImage(req.params.id, req.params.publicId, req.user!.id),
  );
});

export const reorderSubProductImagesHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await productService.reorderSubProductImages(req.params.id, req.body.publicIds, req.user!.id),
  );
});

export const importProductsHandler = asyncHandler(async (req: Request, res) => {
  if (!req.file) throw new ValidationError('Excel file is required (field name: "file")');
  return sendSuccess(
    res,
    await productService.importProductsFromExcel(req.file.buffer, req.user!.id),
  );
});

export const exportProductsHandler = asyncHandler(async (req, res) => {
  const buffer = await productService.exportProductsToExcel(req.query as unknown as ListQuery);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', 'attachment; filename="products.xlsx"');
  res.send(buffer);
});
