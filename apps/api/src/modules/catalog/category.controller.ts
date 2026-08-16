import type { Request } from 'express';

import { sendPaginated, sendCreated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import * as categoryService from './category.service';

export const listCategoriesHandler = asyncHandler(async (_req, res) => {
  const tree = await categoryService.listCategoryTree();
  return sendSuccess(res, tree);
});

export const listCategoriesFlatHandler = asyncHandler(async (req, res) => {
  const result = await categoryService.listCategories(req.query as unknown as ListQuery);
  return sendPaginated(res, result.items, result.meta);
});

export const getCategoryHandler = asyncHandler(async (req, res) => {
  const category = await categoryService.getCategoryById(req.params.id);
  return sendSuccess(res, category);
});

export const createCategoryHandler = asyncHandler(async (req: Request, res) => {
  const category = await categoryService.createCategory(req.body, req.user!.id);
  return sendCreated(res, category);
});

export const updateCategoryHandler = asyncHandler(async (req: Request, res) => {
  const category = await categoryService.updateCategory(req.params.id, req.body, req.user!.id, req.user!.role);
  return sendSuccess(res, category);
});

export const deleteCategoryHandler = asyncHandler(async (req: Request, res) => {
  await categoryService.deleteCategory(req.params.id, req.user!.id);
  return sendSuccess(res, { deleted: true });
});
