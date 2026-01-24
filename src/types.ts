export interface RepositoryEndpoint {
  method: 'get' | 'post' | 'put' | 'delete';
  path: string;
  handlerName: string;
}